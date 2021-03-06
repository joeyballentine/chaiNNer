# pylint: disable=relative-beyond-top-level

from ...utils.image_utils import normalize
from .base_input import BaseInput
from .. import expression


class AudioInput(BaseInput):
    """Input a 1D Audio NumPy array"""

    def __init__(self, label: str = "Audio"):
        super().__init__("Audio", label)


class ImageInput(BaseInput):
    """Input a 2D Image NumPy array"""

    def __init__(
        self,
        label: str = "Image",
        image_type: expression.ExpressionJson = "Image",
    ):
        super().__init__(image_type, label)

    def enforce(self, value):
        return normalize(value)


class VideoInput(BaseInput):
    """Input a 3D Video NumPy array"""

    def __init__(self, label: str = "Video"):
        super().__init__("Video", label)
