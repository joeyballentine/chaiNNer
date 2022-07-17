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
class SeparateRgbaNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = (
            "Split image channels into separate channels. "
            "Typically used for splitting off an alpha (transparency) layer."
        )
        self.inputs = [ImageInput()]
        self.outputs = [
            ImageOutput(
                "R Channel", expression.Image(size_as="Input0", channels=1)
            ).with_id(2),
            ImageOutput(
                "G Channel", expression.Image(size_as="Input0", channels=1)
            ).with_id(1),
            ImageOutput(
                "B Channel", expression.Image(size_as="Input0", channels=1)
            ).with_id(0),
            ImageOutput("A Channel", expression.Image(size_as="Input0", channels=1)),
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Separate RGBA"
        self.icon = "MdCallSplit"
        self.sub = "All"

    def run(
        self, img: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        h, w, c = get_h_w_c(img)
        safe_out = np.ones((h, w))

        if img.ndim == 2:
            return img, safe_out, safe_out, safe_out

        c = min(c, 4)

        out = []
        for i in range(c):
            out.append(img[:, :, i])
        for i in range(4 - c):
            out.append(safe_out)

        return out[2], out[1], out[0], out[3]


@NodeFactory.register("chainner:image:combine_rgba")
class CombineRgbaNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = (
            "Merges the given channels together and returns an RGBA image."
            " All channel images must be a single channel image."
        )
        self.inputs = [
            ImageInput("R Channel", image_type=expression.Image(channels=1)),
            ImageInput("G Channel", image_type=expression.Image(channels=1)),
            ImageInput("B Channel", image_type=expression.Image(channels=1)),
            ImageInput(
                "A Channel", image_type=expression.Image(channels=1)
            ).make_optional(),
        ]
        self.outputs = [
            ImageOutput(
                image_type=expression.Image(
                    width="Input0.width & Input1.width & Input2.width & match Input3 { Image as i => i.width, _ => any }",
                    height="Input0.height & Input1.height & Input2.height & match Input3 { Image as i => i.height, _ => any }",
                    channels=4,
                )
            ).with_never_reason(
                "The input channels have different sizes but must all be the same size."
            )
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Combine RGBA"
        self.icon = "MdCallMerge"
        self.sub = "All"

    def run(
        self,
        img_r: np.ndarray,
        img_g: np.ndarray,
        img_b: np.ndarray,
        img_a: Union[np.ndarray, None],
    ) -> np.ndarray:
        start_shape = img_r.shape[:2]

        for im in img_g, img_b, img_a:
            if im is not None:
                assert (
                    im.shape[:2] == start_shape
                ), "All channel images must have the same resolution"

        def get_channel(img: np.ndarray) -> np.ndarray:
            if img.ndim == 2:
                return img

            c = get_h_w_c(img)[2]
            assert c == 1, (
                "All channel images must only have exactly one channel."
                " Suggestion: Convert to grayscale first."
            )

            return img[:, :, 0]

        channels = [
            get_channel(img_b),
            get_channel(img_g),
            get_channel(img_r),
            get_channel(img_a) if img_a is not None else np.ones(start_shape),
        ]

        return np.stack(channels, axis=2)


@NodeFactory.register("chainner:image:merge_channels")
class ChannelMergeRGBANode(NodeBase):
    """NumPy Merger node"""

    def __init__(self):
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
                image_type=expression.Image(
                    size_as="Input0",
                    channels="""
                    match add(
                        Input0.channels,
                        match Input1 { Image as i => i.channels, _ => 0 },
                        match Input2 { Image as i => i.channels, _ => 0 },
                        match Input3 { Image as i => i.channels, _ => 0 }
                    ) {
                        1 => 1,
                        2 | 3 => 3,
                        int(4..) => 4
                    }
                    """,
                )
            )
        ]
        self.category = IMAGE_CHANNEL
        self.name = "Merge Channels"
        self.icon = "MdCallMerge"
        self.sub = "All"
        self.deprecated = True

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
    def __init__(self):
        super().__init__()
        self.description = (
            "Split image channels into RGB and Alpha (transparency) channels."
        )
        self.inputs = [ImageInput(image_type=expression.Image(channels=[1, 3, 4]))]
        self.outputs = [
            ImageOutput("RGB Channels", expression.Image(size_as="Input0", channels=3)),
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
    def __init__(self):
        super().__init__()
        self.description = "Merge RGB and Alpha (transparency) image channels into 4-channel RGBA channels."
        self.inputs = [
            ImageInput("RGB Channels"),
            ImageInput("Alpha Channel", expression.Image(channels=1)),
        ]
        self.outputs = [
            ImageOutput(
                image_type=expression.Image(
                    width="Input0.width & Input1.width",
                    height="Input0.height & Input1.height",
                    channels=4,
                )
            ).with_never_reason(
                "The RGB and alpha channels have different sizes but must have the same size."
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
    def __init__(self):
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
