#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.27", "websockets>=13", "pillow>=10"]
# ///
"""Phase 0 benchmark: time, VRAM peak, determinism, model switch and OOM text per family."""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Self

import httpx
import websockets
from PIL import Image, ImageChops

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = REPO_ROOT / "workflows"
OUT_DIR = REPO_ROOT / "docs" / "benchmark"
FIXTURE_DIR = REPO_ROOT / "backend" / "tests" / "fixtures" / "ws"
COMFY = "127.0.0.1:8188"
SEED = 42
VRAM_POLL_S = 0.25
RUN_TIMEOUT_S = 600

PROMPTS = {
    "ritratto": "portrait of an old fisherman, weathered face, golden hour light, 85mm photo",
    "paesaggio": "misty alpine lake at dawn, pine forest, mountains reflected in the water, wide angle",
    "prodotto": "studio product photo of a ceramic coffee mug on a walnut table, soft light, minimal",
    "insegna": 'a small bakery storefront with a wooden sign that reads "APERTO TUTTI I GIORNI"',
    "relazioni": "a red cube on top of a blue sphere, a yellow cone to the left of the sphere, white background",
    "illustrazione": "cozy reading corner, wooden shelves, rain on the window, warm light, flat illustration",
    "it_ritratto": "ritratto di un vecchio pescatore con il volto segnato, luce dorata del tramonto, foto 85mm",
    "it_paesaggio": "lago alpino avvolto nella nebbia all'alba, bosco di pini, montagne riflesse nell'acqua",
}

TASKS = {
    "bozza": {
        "template": "sdxl_lightning_txt2img.json",
        "family": "sdxl",
        "size": (1152, 896),
    },
    "qualita": {"template": "sdxl_txt2img.json", "family": "sdxl", "size": (1152, 896)},
    "testo": {
        "template": "flux2_klein_txt2img.json",
        "family": "flux2_klein",
        "size": (1152, 896),
    },
}

SIZE_FIELDS = {"@latent": ("width", "height"), "@scheduler": ("width", "height")}


@dataclass
class RunResult:
    task: str
    prompt_key: str
    seconds: float
    vram_peak_mib: int
    image_path: str | None
    error: str | None = None
    ws_messages: list[dict] = field(default_factory=list)


def bind(
    template: dict, prompt: str, seed: int, size: tuple[int, int], batch: int = 1
) -> dict:
    """Return a copy of the template with prompt, seed, size and batch written by node title."""
    graph = copy.deepcopy(template)
    for node in graph.values():
        title = node.get("_meta", {}).get("title", "")
        inputs = node["inputs"]
        if title == "@prompt_pos":
            inputs["text"] = prompt
        elif title == "@sampler":
            inputs["seed"] = seed
        elif title == "@noise":
            inputs["noise_seed"] = seed
        if title in SIZE_FIELDS:
            inputs["width"], inputs["height"] = size
        if title == "@latent":
            inputs["batch_size"] = batch
    return graph


class VramSampler:
    """Polls nvidia-smi in a thread and keeps the peak used memory."""

    def __init__(self) -> None:
        self.peak = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def _loop(self) -> None:
        while not self._stop.is_set():
            out = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=memory.used",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if out.returncode == 0 and out.stdout.strip():
                self.peak = max(self.peak, int(out.stdout.strip().splitlines()[0]))
            self._stop.wait(VRAM_POLL_S)

    def __enter__(self) -> Self:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._thread.join()


async def execute(
    graph: dict, record_ws: bool = False
) -> tuple[list[bytes], str | None, list[dict]]:
    """Queue a graph, follow the websocket until done, return PNG bytes, error text, ws log."""
    client_id = str(uuid.uuid4())
    log: list[dict] = []
    async with (
        websockets.connect(
            f"ws://{COMFY}/ws?clientId={client_id}", max_size=None
        ) as ws,
        httpx.AsyncClient(base_url=f"http://{COMFY}", timeout=60) as http,
    ):
        resp = await http.post(
            "/prompt", json={"prompt": graph, "client_id": client_id}
        )
        body = resp.json()
        if resp.status_code != 200:
            return [], json.dumps(body), log
        prompt_id = body["prompt_id"]
        error = None
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=RUN_TIMEOUT_S)
            if isinstance(raw, bytes):
                if record_ws:
                    log.append(
                        {
                            "binary": True,
                            "length": len(raw),
                            "header_hex": raw[:8].hex(),
                        }
                    )
                continue
            msg = json.loads(raw)
            if record_ws:
                log.append(msg)
            data = msg.get("data", {})
            if data.get("prompt_id") not in (None, prompt_id):
                continue
            if msg["type"] == "execution_error":
                # Keep the diagnosis only: the traceback carries absolute local paths.
                error = json.dumps(
                    {
                        k: data.get(k)
                        for k in ("node_type", "exception_type", "exception_message")
                    }
                )
                break
            if msg["type"] == "execution_success" or (
                msg["type"] == "executing" and data.get("node") is None
            ):
                break
        history = (await http.get(f"/history/{prompt_id}")).json().get(prompt_id, {})
        images = []
        for output in history.get("outputs", {}).values():
            for img in output.get("images", []):
                params = {k: img[k] for k in ("filename", "subfolder", "type")}
                images.append((await http.get("/view", params=params)).content)
        return images, error, log


def run_one(
    task: str,
    prompt_key: str,
    out_name: str,
    size: tuple[int, int] | None = None,
    batch: int = 1,
    record_ws: bool = False,
    seed: int = SEED,
) -> RunResult:
    spec = TASKS[task]
    template = json.loads((WORKFLOWS / spec["template"]).read_text())
    graph = bind(template, PROMPTS[prompt_key], seed, size or spec["size"], batch)
    start = time.perf_counter()
    with VramSampler() as vram:
        images, error, log = asyncio.run(execute(graph, record_ws=record_ws))
    seconds = round(time.perf_counter() - start, 2)
    path = None
    if images:
        path = OUT_DIR / "images" / f"{out_name}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(images[0])
    result = RunResult(
        task,
        prompt_key,
        seconds,
        vram.peak,
        str(path.relative_to(REPO_ROOT)) if path else None,
        error,
        log,
    )
    print(
        f"{out_name:<32} {seconds:>7.2f}s  vram {vram.peak:>5} MiB  {'ERROR' if error else 'ok'}"
    )
    return result


def free_engine() -> None:
    httpx.post(
        f"http://{COMFY}/free",
        json={"unload_models": True, "free_memory": True},
        timeout=60,
    )
    time.sleep(
        2
    )  # /free is asynchronous in ComfyUI: give the unload a moment before timing


def identical(path_a: str, path_b: str) -> bool:
    a = Image.open(REPO_ROOT / path_a).convert("RGB")
    b = Image.open(REPO_ROOT / path_b).convert("RGB")
    return a.size == b.size and ImageChops.difference(a, b).getbbox() is None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", nargs="+", default=list(TASKS))
    args = parser.parse_args()
    results: dict[str, object] = {
        "runs": [],
        "determinism": {},
        "switch": {},
        "oom": {},
    }

    for task in args.tasks:
        free_engine()
        cold = run_one(
            task, "ritratto", f"{task}_ritratto_cold", record_ws=(task == args.tasks[0])
        )
        fixture = FIXTURE_DIR / f"{task}_run.json"
        if cold.ws_messages and not fixture.exists():
            FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
            fixture.write_text(json.dumps(cold.ws_messages, indent=1))
        results["runs"].append({**cold.__dict__, "ws_messages": None, "cold": True})
        for key in PROMPTS:
            if key == "ritratto":
                continue  # same graph as the cold run: ComfyUI would serve it from cache
            run = run_one(task, key, f"{task}_{key}")
            results["runs"].append({**run.__dict__, "ws_messages": None, "cold": False})
        # /free with free_memory also resets the node cache, so this really re-samples.
        free_engine()
        rerun = run_one(task, "ritratto", f"{task}_ritratto_rerun")
        if cold.image_path and rerun.image_path:
            results["determinism"][TASKS[task]["family"]] = identical(
                cold.image_path, rerun.image_path
            )

    if {"bozza", "testo"} <= set(args.tasks):
        # Fresh seeds so no node is served from ComfyUI's cache during the switch timings.
        run_one("bozza", "ritratto", "switch_warmup", seed=SEED + 1)
        no_free = run_one(
            "testo", "ritratto", "switch_sdxl_to_flux_nofree", seed=SEED + 2
        )
        back = run_one("bozza", "ritratto", "switch_flux_to_sdxl_nofree", seed=SEED + 3)
        free_engine()
        with_free = run_one(
            "testo", "ritratto", "switch_to_flux_after_free", seed=SEED + 4
        )
        results["switch"] = {
            "sdxl_to_flux_nofree_s": no_free.seconds,
            "flux_to_sdxl_nofree_s": back.seconds,
            "flux_after_free_s": with_free.seconds,
            "errors": [r.error for r in (no_free, back, with_free) if r.error],
        }

    for task, size in (("qualita", (1728, 1152)), ("testo", (2048, 2048))):
        if task in args.tasks:
            probe = run_one(task, "paesaggio", f"oom_probe_{task}", size=size, batch=4)
            results["oom"][task] = {
                "size": size,
                "batch": 4,
                "seconds": probe.seconds,
                "vram_peak_mib": probe.vram_peak_mib,
                "error": probe.error,
            }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False)
    )
    print(f"\nResults written to {OUT_DIR / 'results.json'}")


if __name__ == "__main__":
    main()
