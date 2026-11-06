import { parseHTML } from "linkedom";

type ExcalidrawScene = {
	type?: unknown;
	elements?: unknown;
	appState?: unknown;
	files?: unknown;
};

type ExcalidrawExporter = (scene: {
	elements: unknown[];
	appState: Record<string, unknown>;
	files: Record<string, unknown>;
}) => Promise<SVGSVGElement>;

let exporterPromise: Promise<ExcalidrawExporter> | undefined;

// Excalidraw 的 UMD 包把 `browser-fs-access` 拆成了 Webpack 分包。服务端导出
// SVG 时预先载入本地生产分包，避免开发服务器把它请求到 unpkg。
const EXCALIDRAW_VENDOR_CHUNK =
	"@excalidraw/excalidraw/dist/excalidraw-assets/vendor-677e88ca78c86bddf13d.js";
const EXCALIDRAW_PRODUCTION_BUNDLE =
	"@excalidraw/excalidraw/dist/excalidraw.production.min.js";

function installBuildDom(): void {
	if (typeof document !== "undefined") return;

	const { window } = parseHTML(
		"<!doctype html><html><head></head><body></body></html>",
	);
	Object.defineProperty(window, "location", {
		configurable: true,
		value: new URL("https://excalidraw-preview.local/"),
	});

	class BuildPath2D {
		roundRect(): this {
			return this;
		}
	}

	// Excalidraw 在模块初始化时检测 Canvas 能力；SVG 导出不实际绘制 Canvas。
	Object.defineProperty(window.HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: () => ({}),
	});
	Object.defineProperty(window.HTMLElement.prototype, "innerText", {
		configurable: true,
		get() {
			return this.textContent ?? "";
		},
		set(value: string) {
			this.textContent = String(value);
		},
	});

	Object.assign(globalThis, {
		window,
		// Excalidraw 的 Webpack 运行时和预加载的 vendor 分包需要共用同一全局对象。
		self: globalThis,
		document: window.document,
		HTMLElement: window.HTMLElement,
		Element: window.Element,
		SVGElement: window.SVGElement,
		Node: window.Node,
		DOMParser: window.DOMParser,
		XMLSerializer: window.XMLSerializer,
		Image: window.Image,
		HTMLCanvasElement: window.HTMLCanvasElement,
		Path2D: BuildPath2D,
		devicePixelRatio: 1,
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: window.navigator,
	});
}

async function getExporter(): Promise<ExcalidrawExporter> {
	exporterPromise ??= (async () => {
		installBuildDom();
		await import(EXCALIDRAW_VENDOR_CHUNK);
		const imported = await import(EXCALIDRAW_PRODUCTION_BUNDLE);
		const packageExports = (imported.default ?? imported) as {
			exportToSvg?: (
				scene: Parameters<ExcalidrawExporter>[0],
				options: {
					exportBackground: boolean;
					exportPadding: number;
					embedScene: boolean;
				},
			) => Promise<SVGSVGElement>;
		};

		if (!packageExports.exportToSvg) {
			throw new Error("未找到 Excalidraw SVG 导出 API");
		}

		return (scene) =>
			packageExports.exportToSvg!(scene, {
				exportBackground: true,
				exportPadding: 16,
				embedScene: false,
			});
	})();

	return exporterPromise;
}

function parseScene(source: string, identifier: string): ExcalidrawScene {
	let scene: ExcalidrawScene;
	try {
		scene = JSON.parse(source) as ExcalidrawScene;
	} catch (error) {
		throw new Error(
			`无法解析 Excalidraw 文件 ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (
		!scene ||
		typeof scene !== "object" ||
		scene.type !== "excalidraw" ||
		!Array.isArray(scene.elements)
	) {
		throw new Error(`无效的 Excalidraw 文件: ${identifier}`);
	}

	return scene;
}

/** 在构建期把 Excalidraw JSON 导出为静态 SVG。 */
export async function renderExcalidrawSvg(
	source: string,
	identifier: string,
): Promise<string> {
	const scene = parseScene(source, identifier);
	const exporter = await getExporter();
	const svg = await exporter({
		elements: scene.elements as unknown[],
		appState:
			scene.appState && typeof scene.appState === "object"
				? (scene.appState as Record<string, unknown>)
				: { viewBackgroundColor: "#ffffff" },
		files:
			scene.files && typeof scene.files === "object"
				? (scene.files as Record<string, unknown>)
				: {},
	});

	return svg.outerHTML;
}
