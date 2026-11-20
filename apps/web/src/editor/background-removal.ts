import { getAssetUrl, addAsset } from "@/storage/assets";
import { getEditor } from "./store";
import type { ImageLayer } from "./types";

const MODEL_ID = "briaai/RMBG-1.4";

type Pipeline = {
	model: (inputs: { input: unknown }) => Promise<{ output: unknown[] }>;
	processor: (image: unknown) => Promise<{ pixel_values: unknown }>;
	RawImage: {
		fromURL: (url: string) => Promise<RawImageLike>;
		fromTensor: (tensor: unknown) => RawImageLike;
	};
};

type RawImageLike = {
	width: number;
	height: number;
	data: Uint8ClampedArray | Uint8Array;
	resize: (width: number, height: number) => Promise<RawImageLike>;
};

let pipelinePromise: Promise<Pipeline> | null = null;

async function loadPipeline(
	onProgress?: (progress: number) => void,
): Promise<Pipeline> {
	if (!pipelinePromise) {
		pipelinePromise = (async () => {
			const transformers = await import("@huggingface/transformers");
			const { AutoModel, AutoProcessor, RawImage, env } = transformers;
			env.allowLocalModels = false;
			const progress_callback = (event: { status: string; progress?: number }) => {
				if (event.status === "progress" && typeof event.progress === "number") {
					onProgress?.(event.progress);
				}
			};
			const model = await AutoModel.from_pretrained(MODEL_ID, {
				config: { model_type: "custom" } as never,
				dtype: "fp32",
				progress_callback,
			});
			const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
				config: {
					do_normalize: true,
					do_pad: false,
					do_rescale: true,
					do_resize: true,
					image_mean: [0.5, 0.5, 0.5],
					feature_extractor_type: "ImageFeatureExtractor",
					image_std: [1, 1, 1],
					resample: 2,
					rescale_factor: 0.00392156862745098,
					size: { width: 1024, height: 1024 },
				},
			});
			return {
				model: model as unknown as Pipeline["model"],
				processor: processor as unknown as Pipeline["processor"],
				RawImage: RawImage as unknown as Pipeline["RawImage"],
			};
		})();
		pipelinePromise.catch(() => {
			pipelinePromise = null;
		});
	}
	return pipelinePromise;
}

/**
 * Removes the background of an image layer using an on-device model and
 * swaps the layer to a new transparent asset (undoable).
 */
export async function removeBackground(
	layer: ImageLayer,
	onProgress?: (progress: number) => void,
) {
	const editor = getEditor();
	if (!editor.projectId) throw new Error("No project open");
	const url = await getAssetUrl(layer.assetId);
	if (!url) throw new Error("Image not found");

	const { model, processor, RawImage } = await loadPipeline(onProgress);
	const image = await RawImage.fromURL(url);
	const { pixel_values } = await processor(image);
	const { output } = await model({ input: pixel_values });
	const tensor = output[0] as { mul: (n: number) => { to: (t: string) => unknown } };
	const mask = await RawImage.fromTensor(tensor.mul(255).to("uint8")).resize(
		image.width,
		image.height,
	);

	const canvas = document.createElement("canvas");
	canvas.width = image.width;
	canvas.height = image.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas is not supported");
	const source = await new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
	ctx.drawImage(source, 0, 0, image.width, image.height);
	const pixels = ctx.getImageData(0, 0, image.width, image.height);
	for (let i = 0; i < mask.data.length; i++) {
		pixels.data[i * 4 + 3] = mask.data[i];
	}
	ctx.putImageData(pixels, 0, 0);

	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/png"),
	);
	const asset = await addAsset({
		projectId: editor.projectId,
		blob,
		name: `${layer.name} (no background).png`,
	});
	getEditor().addAssetMeta(asset);
	getEditor().updateLayer(layer.id, { assetId: asset.id } as Partial<ImageLayer>);
	return asset;
}
