import asyncio


async def drain_task[T](task: asyncio.Task[T]) -> T:
    """Finish owned I/O despite repeated caller cancellation before releasing its resources."""
    while not task.done():
        try:
            return await asyncio.shield(arg=task)
        except asyncio.CancelledError:
            continue
    return task.result()
