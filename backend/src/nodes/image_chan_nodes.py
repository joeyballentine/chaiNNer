from __future__ import annotations

import cv2
import numpy as np
from sanic.log import logger

from .categories import IMAGE_CHANNEL
from .node_base import NodeBase
from .node_factory import NodeFactory
from .properties.inputs import *
from .properties.outputs import *
from .properties import expression
from .utils.fill_alpha import *
from .utils.pil_utils import *
from .utils.utils import get_h_w_c


@NodeFactory.register("chainner:image:split_channels")
class ChannelSplitRGBANode(NodeBase):
    """NumPy Splitter node"""

    def __init__(self):
        """Constructor"""
        super().__init__()
        self.description = (
            "Split image channels into separate channels. "
            "Typically used for splitting off an alpha (transparency) layer."
        )
        self.inputs = [ImageInput()]
        self.outputs = [
            ImageOutput("Blue Channel", expression.Image(size_as="Input0", channels=1)),
            ImageOutput(
                "Green Channel", expression.Image(size_as="Input0", channels=1)
            ),
            ImageOutput("Red Channel", expression.Image(size_as="Input0", channels=1)),
            ImageOutput(
                "Alpha Channel", expression.Image(size_as="Input0", channels=1)
            ),
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Split Channels"
        self.icon = "MdCallSplit"
        self.sub = "All"

    def run(self, img: np.ndarray) -> list[np.ndarray]:
        """Split a multi-channel image into separate channels"""

        c = 1
        dtype_max = 1
        try:
            dtype_max = np.iinfo(img.dtype).max
        except:
            logger.debug("img dtype is not int")

        if img.ndim > 2:
            c = img.shape[2]
            safe_out = np.ones_like(img[:, :, 0]) * dtype_max
        else:
            safe_out = np.ones_like(img) * dtype_max

        out = []
        for i in range(c):
            out.append(img[:, :, i])
        for i in range(4 - c):
            out.append(safe_out)

        return out


@NodeFactory.register("chainner:image:merge_channels")
class ChannelMergeRGBANode(NodeBase):
    """NumPy Merger node"""

    def __init__(self):
        """Constructor"""
        super().__init__()
        self.description = (
            "Merge image channels together into a ≤4 channel image. "
            "Typically used for combining an image with an alpha layer."
        )
        self.inputs = [
            ImageInput("Channel(s) A"),
            ImageInput("Channel(s) B").make_optional(),
            ImageInput("Channel(s) C").make_optional(),
            ImageInput("Channel(s) D").make_optional(),
        ]
        self.outputs = [
            ImageOutput(
                image_type=expression.Image(size_as="Input0", channels=[1, 3, 4])
            )
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Merge Channels"
        self.icon = "MdCallMerge"
        self.sub = "All"

    def run(
        self,
        im1: np.ndarray,
        im2: Union[np.ndarray, None],
        im3: Union[np.ndarray, None],
        im4: Union[np.ndarray, None],
    ) -> np.ndarray:
        """Combine separate channels into a multi-chanel image"""

        start_shape = im1.shape[:2]

        for im in im2, im3, im4:
            if im is not None:
                assert (
                    im.shape[:2] == start_shape
                ), "All images to be merged must be the same resolution"

        imgs = []
        for img in im1, im2, im3, im4:
            if img is not None:
                imgs.append(img)

        for idx, img in enumerate(imgs):
            if img.ndim == 2:
                imgs[idx] = np.expand_dims(img, axis=2)

        img = np.concatenate(imgs, axis=2)

        # ensure output is safe number of channels
        _, _, c = get_h_w_c(img)
        if c == 2:
            b, g = cv2.split(img)
            img = cv2.merge((b, g, g))
        elif c > 4:
            img = img[:, :, :4]

        return img


@NodeFactory.register("chainner:image:split_transparency")
class TransparencySplitNode(NodeBase):
    """Transparency-specific Splitter node"""

    def __init__(self):
        """Constructor"""
        super().__init__()
        self.description = (
            "Split image channels into RGB and Alpha (transparency) channels."
        )
        self.inputs = [ImageInput(image_type=expression.Image(channels=[1, 3, 4]))]
        self.outputs = [
            ImageOutput("RGB Channels", expression.Image(size_as="Input0", channels=2)),
            ImageOutput(
                "Alpha Channel", expression.Image(size_as="Input0", channels=1)
            ),
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Split Transparency"
        self.icon = "MdCallSplit"
        self.sub = "Transparency"

    def run(self, img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Split a multi-channel image into separate channels"""

        if img.ndim == 2:
            logger.debug("Expanding image channels")
            img = np.tile(np.expand_dims(img, axis=2), (1, 1, min(4, 3)))
        # Pad with solid alpha channel if needed (i.e three channel image)
        elif img.shape[2] == 3:
            logger.debug("Expanding image channels")
            img = np.dstack((img, np.full(img.shape[:-1], 1.0)))

        rgb = img[:, :, :3]
        alpha = img[:, :, 3]

        return rgb, alpha


@NodeFactory.register("chainner:image:merge_transparency")
class TransparencyMergeNode(NodeBase):
    """Transparency-specific Merge node"""

    def __init__(self):
        """Constructor"""
        super().__init__()
        self.description = "Merge RGB and Alpha (transparency) image channels into 4-channel RGBA channels."
        self.inputs = [
            ImageInput("RGB Channels"),
            ImageInput("Alpha Channel", expression.Image(channels=1)),
        ]
        self.outputs = [
            ImageOutput(
                image_type=expression.Image(
                    size_as=expression.intersect("Input0", "Input1"), channels=4
                )
            )
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Merge Transparency"
        self.icon = "MdCallMerge"
        self.sub = "Transparency"

    def run(self, rgb: np.ndarray, a: np.ndarray) -> np.ndarray:
        """Combine separate channels into a multi-chanel image"""

        start_shape = rgb.shape[:2]
        logger.info(start_shape)

        for im in rgb, a:
            if im is not None:
                logger.info(im.shape[:2])
                assert (
                    im.shape[:2] == start_shape
                ), "All images to be merged must be the same resolution"

        if rgb.ndim == 2:
            rgb = cv2.merge((rgb, rgb, rgb))
        elif rgb.ndim > 2 and rgb.shape[2] == 2:
            rgb = cv2.merge(
                (rgb, np.zeros((rgb.shape[0], rgb.shape[1], 1), dtype=rgb.dtype))
            )
        elif rgb.shape[2] > 3:
            rgb = rgb[:, :, :3]

        if a.ndim > 2:
            a = a[:, :, 0]
        a = np.expand_dims(a, axis=2)

        imgs = [rgb, a]
        for img in imgs:
            logger.info(img.shape)
        img = np.concatenate(imgs, axis=2)

        return img


@NodeFactory.register("chainner:image:fill_alpha")
class FillAlphaNode(NodeBase):
    """Fills the transparent pixels of an image with nearby colors"""

    def __init__(self):
        """Constructor"""
        super().__init__()
        self.description = (
            "Fills the transparent pixels of an image with nearby colors."
        )
        self.inputs = [
            ImageInput("RGBA", expression.Image(channels=4)),
            AlphaFillMethodInput(),
        ]
        self.outputs = [
            ImageOutput(
                "RGB",
                expression.Image(size_as="Input0", channels=3),
            ),
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Fill Alpha"
        self.icon = "MdOutlineFormatColorFill"
        self.sub = "Miscellaneous"

    def run(self, img: np.ndarray, method: int) -> np.ndarray:
        """Fills transparent holes in the given image"""

        _, _, c = get_h_w_c(img)
        assert c == 4, "The image has to be an RGBA image to fill its alpha"

        if method == AlphaFillMethod.EXTEND_TEXTURE:
            # Preprocess to convert the image into binary alpha
            convert_to_binary_alpha(img)
            img = fill_alpha_fragment_blur(img)

            convert_to_binary_alpha(img)
            fill_alpha_edge_extend(img, 8)
        elif method == AlphaFillMethod.EXTEND_COLOR:
            convert_to_binary_alpha(img)
            fill_alpha_edge_extend(img, 40)
        else:
            assert False, f"Invalid alpha fill method {type(method)} {method}"

        # Finally, add a black background and convert to RGB
        img[:, :, 0] *= img[:, :, 3]
        img[:, :, 1] *= img[:, :, 3]
        img[:, :, 2] *= img[:, :, 3]
        return img[:, :, :3]
