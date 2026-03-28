"""Agent communication exceptions."""


class NoActiveConnection(Exception):
    def __init__(self, box_id: str) -> None:
        self.box_id = box_id
        super().__init__(f"No active connection for box: {box_id}")


class ConnectionTimeout(Exception):
    def __init__(self, box_id: str, timeout: float) -> None:
        self.box_id = box_id
        super().__init__(f"Connection timeout for box {box_id} after {timeout}s")
