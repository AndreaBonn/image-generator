import httpx

ENGINE_HEALTH_TIMEOUT_S = 2.0


async def fetch_engine_health(comfy_url: str) -> bool:
    async with httpx.AsyncClient(timeout=ENGINE_HEALTH_TIMEOUT_S, trust_env=False) as client:
        response = await client.get(url=f"{comfy_url}/system_stats")
        response.raise_for_status()
        return True
