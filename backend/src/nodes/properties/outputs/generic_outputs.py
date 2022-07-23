from .base_output import BaseOutput
from .. import expression


def NumberOutput(label: str, output_type: expression.ExpressionJson = "number"):
    """Output for arbitrary number"""
    return BaseOutput(expression.intersect("number", output_type), label)


class TextOutput(BaseOutput):
    def __init__(
        self, label: str, output_type: expression.ExpressionJson = "string", kind="text"
    ):
        super().__init__(expression.intersect("string", output_type), label, kind=kind)

    def get_broadcast_data(self, value: str):
        return value
