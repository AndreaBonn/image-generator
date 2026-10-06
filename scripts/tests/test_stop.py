import importlib.util
import json
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "stop.py"
spec = importlib.util.spec_from_file_location("stop", SCRIPT)
stop_mod = importlib.util.module_from_spec(spec)
sys.modules["stop"] = stop_mod
spec.loader.exec_module(stop_mod)

pgrep_fallback = sys.modules["pgrep_fallback"]
platform_support = sys.modules["platform_support"]

REPO = Path("/repo")


def make_pgrep(sequence):
    """Returns a fake `pgrep` yielding each list in `sequence` in turn,
    then repeating the last one forever."""
    calls = iter(sequence)
    remaining = {"last": sequence[-1] if sequence else []}

    def pgrep(pattern):
        try:
            result = next(calls)
            remaining["last"] = result
            return result
        except StopIteration:
            return remaining["last"]

    return pgrep


def make_clock(start=0.0, step=1.0):
    state = {"t": start}

    def clock():
        t = state["t"]
        state["t"] += step
        return t

    return clock


def make_kill_recorder():
    sent = []

    def kill(pid, signal_name):
        sent.append((pid, signal_name))

    return kill, sent


def make_notify_recorder():
    messages = []

    def notify_send(app_name, message):
        messages.append((app_name, message))

    return notify_send, messages


def make_process_exists(alive_pids):
    """Fake liveness check: a pid is alive iff still in the mutable `alive_pids` set."""

    def process_exists(pid):
        return pid in alive_pids

    return process_exists


# =====================================================================
# pgrep_fallback module: own_process_pattern / own_pids / wait_until_gone
# =====================================================================


def test_own_process_pattern_is_anchored_and_escapes_the_repo_path():
    pattern = pgrep_fallback.own_process_pattern(Path("/home/u/my.repo (1)"))

    assert pattern.startswith("^(")
    assert re.escape("/home/u/my.repo (1)") in pattern


def test_own_pids_forwards_the_pattern_to_pgrep():
    seen = {}

    def fake_pgrep(pattern):
        seen["pattern"] = pattern
        return [42]

    result = pgrep_fallback.own_pids(REPO, pgrep=fake_pgrep)

    assert result == [42]
    assert seen["pattern"] == pgrep_fallback.own_process_pattern(REPO)


def test_wait_until_gone_true_once_pids_list_empties():
    pgrep = make_pgrep([[111], [111], []])
    sleeps = []

    result = pgrep_fallback.wait_until_gone(
        REPO, pgrep=pgrep, timeout_s=30, sleep=sleeps.append, clock=make_clock()
    )

    assert result is True
    assert len(sleeps) == 2


def test_wait_until_gone_false_when_pids_never_disappear():
    pgrep = make_pgrep([[111]])

    result = pgrep_fallback.wait_until_gone(
        REPO,
        pgrep=pgrep,
        timeout_s=0.5,
        sleep=lambda s: None,
        clock=make_clock(start=0.0, step=1.0),
    )

    assert result is False


# =====================================================================
# stop_via_pgrep (the four branches of stop.sh, called directly)
# =====================================================================


def test_stop_via_pgrep_reports_not_running_and_sends_no_signal():
    kill, sent = make_kill_recorder()
    messages = []

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=make_pgrep([[]]),
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=30,
    )

    assert code == 0
    assert sent == []
    assert messages == ["Non era in esecuzione."]


def test_stop_via_pgrep_sends_sigterm_and_succeeds_once_processes_exit():
    kill, sent = make_kill_recorder()
    messages = []

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=make_pgrep([[111], [111], []]),
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=30,
    )

    assert code == 0
    assert sent == [(111, "SIGTERM")]
    assert messages[-1] == "Chiuso. La memoria della scheda video è libera."


def test_stop_via_pgrep_escalates_to_sigkill_when_sigterm_times_out():
    kill, sent = make_kill_recorder()
    messages = []
    # call#1 initial own_pids; call#2 wait_until_gone's check (timeout_s=0 -> times
    # out immediately); call#3 post-escalation own_pids; call#4 final check.
    pgrep = make_pgrep([[111], [111], [111], []])

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=pgrep,
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=0,
    )

    assert code == 0
    assert (111, "SIGTERM") in sent
    assert (111, "SIGKILL") in sent
    assert messages[-1] == "Chiuso. La memoria della scheda video è libera."


def test_stop_via_pgrep_returns_1_when_sigkill_also_fails():
    kill, _sent = make_kill_recorder()
    messages = []
    pgrep = make_pgrep([[111]])  # pids never, ever disappear

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=pgrep,
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=0,
    )

    assert code == 1
    assert (
        messages[-1] == "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer."
    )


# =====================================================================
# run-state file: read_run_state / remove_run_state_file
# =====================================================================


def test_read_run_state_returns_none_when_file_missing(tmp_path):
    assert stop_mod.read_run_state(tmp_path) is None


def test_read_run_state_parses_the_json_file(tmp_path):
    path = platform_support.run_state_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"engine": 11, "backend": 22}))

    state = stop_mod.read_run_state(tmp_path)

    assert state == stop_mod.RunState(engine_pid=11, backend_pid=22)


def test_read_run_state_none_engine_is_preserved(tmp_path):
    path = platform_support.run_state_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"engine": None, "backend": 22}))

    state = stop_mod.read_run_state(tmp_path)

    assert state.engine_pid is None
    assert state.backend_pid == 22


def test_remove_run_state_file_is_a_noop_when_missing(tmp_path):
    stop_mod.remove_run_state_file(tmp_path)  # must not raise


# =====================================================================
# windows_kill_command: built from platform_support.stop_strategy
# =====================================================================


def test_windows_kill_command_graceful_has_no_force_flag():
    assert stop_mod.windows_kill_command(4242, force=False) == ["taskkill", "/PID", "4242", "/T"]


def test_windows_kill_command_force_appends_f_flag():
    assert stop_mod.windows_kill_command(4242, force=True) == [
        "taskkill",
        "/PID",
        "4242",
        "/T",
        "/F",
    ]


# =====================================================================
# stop_pids: graceful to every pid, one shared wait, force only survivors
# =====================================================================


def test_stop_pids_on_windows_runs_graceful_then_force_taskkill():
    run_commands = []
    alive = {4242}  # process never exits on its own in this test

    def run_command(argv):
        run_commands.append(list(argv))

    stop_mod.stop_pids(
        [4242],
        os_name="windows",
        process_exists=make_process_exists(alive),
        send_signal=lambda pid, sig: (_ for _ in ()).throw(
            AssertionError("windows must not use POSIX signals")
        ),
        run_command=run_command,
        sleep=lambda s: None,
        timeout_s=0,  # times out immediately -> forces escalation
    )

    assert run_commands == [
        ["taskkill", "/PID", "4242", "/T"],
        ["taskkill", "/PID", "4242", "/T", "/F"],
    ]


def test_stop_pids_on_posix_sends_sigterm_then_sigkill():
    kill, sent = make_kill_recorder()
    alive = {55}

    stop_mod.stop_pids(
        [55],
        os_name="linux",
        process_exists=make_process_exists(alive),
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=0,
    )

    assert sent == [(55, "SIGTERM"), (55, "SIGKILL")]


def test_stop_pids_skips_force_once_graceful_succeeds():
    kill, sent = make_kill_recorder()

    stop_mod.stop_pids(
        [55],
        os_name="linux",
        process_exists=lambda pid: False,  # already gone by the time we check
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=30,
    )

    assert sent == [(55, "SIGTERM")]


def test_stop_pids_sends_graceful_to_all_before_forcing_any_survivor():
    """T0xx LOW finding: stop.sh signals every pid at once and shares one
    wait, instead of exhausting `timeout_s` on the first pid before even
    trying the second."""
    kill, sent = make_kill_recorder()
    alive = {11, 22}  # neither dies on its own: both need the force signal

    stop_mod.stop_pids(
        [11, 22],
        os_name="linux",
        process_exists=make_process_exists(alive),
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=0,
    )

    assert sent[:2] == [(11, "SIGTERM"), (22, "SIGTERM")]  # graceful to both first
    assert sorted(sent[2:]) == [(11, "SIGKILL"), (22, "SIGKILL")]  # force only after


# =====================================================================
# stop_via_run_state: the four branches with a run-state file present
# =====================================================================


def test_stop_via_run_state_removes_file_and_reports_not_running_when_no_pids(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=None)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: True,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]
    assert not platform_support.run_state_path(tmp_path).exists()


def test_stop_via_run_state_reports_stale_when_recorded_pids_are_gone(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: False,  # both already dead: stale file
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "File di stato obsoleto: rimosso.")]


def engine_cmdline(pid=None):
    return "/repo/engine/ComfyUI/.venv/bin/python3.12 /repo/engine/ComfyUI/main.py --port 8188"


def backend_cmdline(pid=None):
    return "/repo/backend/.venv/bin/python /repo/backend/.venv/bin/uvicorn app.main:create_app"


def test_stop_via_run_state_stops_both_recorded_pids_on_posix(tmp_path):
    kill, sent = make_kill_recorder()
    notify_send, messages = make_notify_recorder()
    alive = {11, 22}
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    def process_exists(pid):
        return pid in alive

    def process_cmdline(pid):
        return engine_cmdline() if pid == 11 else backend_cmdline()

    def send_signal_and_kill(pid, signal_name):
        kill(pid, signal_name)
        if signal_name == "SIGTERM":
            alive.discard(pid)  # dies gracefully in this test

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=process_exists,
        process_cmdline=process_cmdline,
        send_signal=send_signal_and_kill,
        sleep=lambda s: None,
        notify_send=notify_send,
    )

    assert code == 0
    assert sorted(sent) == [(11, "SIGTERM"), (22, "SIGTERM")]
    assert messages[-1] == ("Image Generator", "Chiuso. La memoria della scheda video è libera.")


def test_stop_via_run_state_ignores_engine_when_it_was_preexisting(tmp_path):
    kill, sent = make_kill_recorder()
    notify_send, _messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=22)  # engine not started by start.py

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: pid == 22,  # 22 never dies in this test
        process_cmdline=lambda pid: backend_cmdline(),
        send_signal=kill,
        sleep=lambda s: None,
        timeout_s=0,  # force immediate escalation instead of a real wait
        notify_send=notify_send,
    )

    assert code == 1  # 22 "survives" both signals since process_exists always says alive
    assert sent == [(22, "SIGTERM"), (22, "SIGKILL")]  # engine (None) never touched


def test_stop_via_run_state_returns_1_when_a_pid_survives_force(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=22)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: True,  # never dies, not even after SIGKILL
        process_cmdline=lambda pid: backend_cmdline(),
        send_signal=lambda pid, sig: None,
        sleep=lambda s: None,
        timeout_s=0,
        notify_send=notify_send,
    )

    assert code == 1
    assert messages[-1] == (
        "Image Generator",
        "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer.",
    )


def test_stop_via_run_state_skips_pid_whose_cmdline_does_not_match(tmp_path):
    """T0xx MEDIUM finding: a crash followed by a restart can let an
    unrelated process reuse a recorded PID. The command line, not the bare
    PID, decides whether it is still ours to signal."""
    kill, sent = make_kill_recorder()
    notify_send, messages = make_notify_recorder()
    alive = {11, 22}
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    def process_cmdline(pid):
        if pid == 11:
            return "/usr/bin/some-unrelated-daemon --port 11"  # PID 11 reused
        return backend_cmdline()

    def send_signal_and_kill(pid, signal_name):
        kill(pid, signal_name)
        if signal_name == "SIGTERM":
            alive.discard(pid)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: pid in alive,
        process_cmdline=process_cmdline,
        send_signal=send_signal_and_kill,
        sleep=lambda s: None,
        notify_send=notify_send,
    )

    assert code == 0
    assert sent == [(22, "SIGTERM")]  # pid 11 never signalled: foreign process
    assert messages[-1] == ("Image Generator", "Chiuso. La memoria della scheda video è libera.")
    assert not platform_support.run_state_path(tmp_path).exists()


# =====================================================================
# pid_cmdline_matches: the pure string-matching ownership check
# =====================================================================


def test_pid_cmdline_matches_posix_requires_every_marker():
    assert stop_mod.pid_cmdline_matches(engine_cmdline(), os_name="linux", kind="engine")
    assert not stop_mod.pid_cmdline_matches(
        "/usr/bin/python3 /some/other/main.py", os_name="linux", kind="engine"
    )


def test_pid_cmdline_matches_posix_backend_requires_uvicorn_and_app_main():
    assert stop_mod.pid_cmdline_matches(backend_cmdline(), os_name="darwin", kind="backend")
    assert not stop_mod.pid_cmdline_matches(
        "uvicorn some.other.module:app", os_name="darwin", kind="backend"
    )


def test_pid_cmdline_matches_windows_checks_image_name_only():
    # tasklist /FO CSV /NH exposes only the image name, not the full argv.
    assert stop_mod.pid_cmdline_matches(
        '"python.exe","1234","Console","1","12,345 K"', os_name="windows", kind="engine"
    )
    assert not stop_mod.pid_cmdline_matches(
        '"notepad.exe","1234","Console","1","12,345 K"', os_name="windows", kind="backend"
    )


# =====================================================================
# stop(): dispatcher chooses run-state vs pgrep fallback vs windows no-op
# =====================================================================


def test_stop_uses_run_state_when_file_present(tmp_path):
    notify_send, messages = make_notify_recorder()

    code = stop_mod.stop(
        tmp_path,
        os_name="linux",
        read_run_state=lambda repo_root: stop_mod.RunState(engine_pid=None, backend_pid=None),
        process_exists=lambda pid: True,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]


def test_stop_falls_back_to_pgrep_on_posix_when_file_missing():
    notify_send, messages = make_notify_recorder()

    code = stop_mod.stop(
        REPO,
        os_name="linux",
        read_run_state=lambda repo_root: None,
        pgrep=make_pgrep([[]]),
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]


def test_stop_on_windows_with_no_file_reports_not_running_without_pgrep():
    notify_send, messages = make_notify_recorder()

    def pgrep_must_not_be_called(pattern):
        raise AssertionError("pgrep does not exist on Windows")

    code = stop_mod.stop(
        REPO,
        os_name="windows",
        read_run_state=lambda repo_root: None,
        pgrep=pgrep_must_not_be_called,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]
