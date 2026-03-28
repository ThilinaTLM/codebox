"""Box domain exceptions."""


class BoxNotFound(Exception):
    def __init__(self, box_id: str) -> None:
        self.box_id = box_id
        super().__init__(f"Box not found: {box_id}")


class InvalidStatusTransition(Exception):
    def __init__(self, current: str, target: str) -> None:
        super().__init__(f"Invalid status transition: {current} \u2192 {target}")
