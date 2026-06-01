import { App, FileSystemAdapter, TFile, normalizePath } from 'obsidian';
import { pathExists, readFile } from 'fs-extra';
import { dirname, extname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { MarpSlidesSettings } from './settings';

const IMAGE_MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
};

interface MarkdownDestination {
	target: string;
	build: (replacement: string) => string;
}

interface EmbeddedImage {
	buffer: Buffer;
	mimeType: string;
}

export async function embedHTMLImages(html: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string> {
	let processedHTML = await replaceAsync(html, /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi, async (match, prefix, quote, target, suffix) => {
		const replacement = await getEmbeddedImageDataURI(target, sourceFile, app, settings);
		return replacement ? `${prefix}${quote}${replacement}${suffix}` : match;
	});

	processedHTML = await replaceAsync(processedHTML, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (match, quote, target) => {
		const replacement = await getEmbeddedImageDataURI(target, sourceFile, app, settings);
		return replacement ? `url(${quote}${replacement}${quote})` : match;
	});

	return processedHTML;
}

export function appendMobileTouchNavigation(html: string): string {
	const marker = 'marp-slides-mobile-touch-navigation';

	if (html.includes(marker)) {
		return html;
	}

	const mobileNavigation = `<style id="${marker}">
html, body {
  touch-action: pan-x pan-y pinch-zoom;
  -webkit-overflow-scrolling: touch;
}
</style>`;

	if (html.includes('</body>')) {
		return html.replace('</body>', `${mobileNavigation}</body>`);
	}

	return `${html}${mobileNavigation}`;
}

export function appendPresentationAnnotations(html: string): string {
	const marker = 'marp-slides-presentation-annotations';

	if (html.includes(marker)) {
		return html;
	}

	const presentationAnnotations = `<script id="${marker}-script">
(${presentationAnnotationsRuntime.toString()})();
</script>`;

	if (html.includes('</body>')) {
		return html.replace('</body>', `${presentationAnnotations}</body>`);
	}

	return `${html}${presentationAnnotations}`;
}

export function mountPresentationAnnotations(root?: Document | HTMLElement): void {
	presentationAnnotationsRuntime(root);
}

function presentationAnnotationsRuntime(rootInput?: Document | HTMLElement): void {
	const marker = 'marp-slides-presentation-annotations';
	const win = typeof window !== 'undefined' ? window : undefined;
	const doc = rootInput && (rootInput as Document).nodeType === 9
		? rootInput as Document
		: ((rootInput as HTMLElement | undefined)?.ownerDocument || (typeof document !== 'undefined' ? document : undefined));

	if (!win || !doc || !doc.body) return;

	const runtimeWindow = win as Window;
	const runtimeDocument = doc as Document;

	const host = rootInput && (rootInput as Document).nodeType !== 9
		? rootInput as HTMLElement
		: runtimeDocument.body;
	const scopedHost = host !== runtimeDocument.body;
	const queryRoot = scopedHost ? host : runtimeDocument;

	ensureStyle();

	if (host.querySelector('.marp-slides-annotation-canvas')) return;

	host.classList.add('marp-slides-annotation-host');
	if (scopedHost) {
		host.classList.add('marp-slides-annotation-host-scoped', 'marp-slides-viewport-pan-enabled');
	} else {
		runtimeDocument.documentElement.classList.add('marp-slides-viewport-pan-enabled');
		runtimeDocument.body.classList.add('marp-slides-viewport-pan-enabled');
	}

	const iconAttributes = 'aria-hidden="true" viewBox="0 0 24 24"';
		type Point = { x: number; y: number };
		type FreehandToolName = 'pen' | 'highlighter';
		type ShapeToolName = 'rectangle' | 'circle';
		type ToolMode = 'freehand' | 'shape' | 'laser';
		type AnnotationTool = { label: string; color: string; width: number; alpha: number; composite: GlobalCompositeOperation; icon: string; mode: ToolMode };
		type FreehandAnnotation = { kind: 'freehand'; tool: FreehandToolName; points: Point[] };
		type ShapeAnnotation = { kind: 'shape'; tool: ShapeToolName; start: Point; end: Point };
		type Annotation = FreehandAnnotation | ShapeAnnotation;
		type UndoEntry = { action: 'add'; annotation: Annotation } | { action: 'clear'; annotations: Annotation[] };
	const tools: Record<string, AnnotationTool> = {
			pen: {
				label: 'Marker',
				color: '#ff2b2b',
				width: 4,
				alpha: 1,
				composite: 'source-over',
				mode: 'freehand',
				icon: `<svg ${iconAttributes}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>`,
			},
			highlighter: {
				label: 'Highlighter',
				color: '#ffeb3b',
				width: 20,
				alpha: 0.35,
				composite: 'source-over',
				mode: 'freehand',
				icon: `<svg ${iconAttributes}><path d="M4 20h7l8-8a2.2 2.2 0 0 0-3.1-3.1L8 16.8 4 20Z"/><path d="M14 7l3 3"/><path d="M3 21h18"/></svg>`,
			},
			rectangle: {
				label: 'Rectangle',
				color: '#ff2b2b',
				width: 4,
				alpha: 1,
				composite: 'source-over',
				mode: 'shape',
				icon: `<svg ${iconAttributes}><rect x="5" y="6" width="14" height="12" rx="1.5"/></svg>`,
			},
			circle: {
				label: 'Circle',
				color: '#ff2b2b',
				width: 4,
				alpha: 1,
				composite: 'source-over',
				mode: 'shape',
				icon: `<svg ${iconAttributes}><circle cx="12" cy="12" r="6.5"/></svg>`,
			},
			laser: {
				label: 'Laser pointer',
				color: '#ff1f1f',
				width: 3,
				alpha: 1,
				composite: 'source-over',
				mode: 'laser',
				icon: `<svg ${iconAttributes}><path d="M5 19 19 5"/><circle cx="17" cy="7" r="3"/><path d="M7 17l-2 4 4-2"/></svg>`,
			},
		};
		const clearIcon = `<svg ${iconAttributes}><path d="M5 7h14"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 7l1-3h6l1 3"/><path d="M7 7l1 14h8l1-14"/></svg>`;
	const toolShortcuts: Record<string, string> = { pen: 'm', highlighter: 'h', rectangle: 'r', circle: 'o', laser: 'l' };
	const clearShortcut = 'c';
	const annotationsBySlide = new Map<string, Annotation[]>();
		const undoStackBySlide = new Map<string, UndoEntry[]>();
	const laserLifetime = 3000;
	const laserMinDistance = 2;
	const laserMaxPoints = 180;
		const undoHistoryLimit = 50;
		const shapeMinSize = 4;
	let activeTool: string | null = null;
	let activeAnnotation: Annotation | null = null;
	let activePointerId: number | null = null;
	let canvas: HTMLCanvasElement | null = null;
	let context: CanvasRenderingContext2D | null = null;
	let laserCanvas: HTMLCanvasElement | null = null;
	let laserContext: CanvasRenderingContext2D | null = null;
	let renderFrame = 0;
	let laserFrame = 0;
	let laserPointerId: number | null = null;
	let laserTrail: Array<{ x: number; y: number; time: number; startsStroke?: boolean }> = [];
	let lastSlideKey = getSlideKey();
	let viewportPan: { pointerId: number | null; startX: number; startY: number; scrollLeft: number; scrollTop: number; started: boolean } | null = null;
	let touchViewportPan: { startX: number; startY: number; scrollLeft: number; scrollTop: number; started: boolean } | null = null;
	let pinchZoom: { startDistance: number; startScale: number } | null = null;
	let viewportZoomScale = 1;

	bindViewportWheelPanAndGestureGuard();
	bindMouseDragViewportPan();
	bindGestureNavigationGuard();

	onReady(() => {
		canvas = runtimeDocument.createElement('canvas');
		canvas.className = 'marp-slides-annotation-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		host.appendChild(canvas);
		context = canvas.getContext('2d');

		laserCanvas = runtimeDocument.createElement('canvas');
		laserCanvas.className = 'marp-slides-laser-canvas';
		laserCanvas.setAttribute('aria-hidden', 'true');
		host.appendChild(laserCanvas);
		laserContext = laserCanvas.getContext('2d');

		if (!context) return;

		createAnnotationControls();
		bindKeyboardShortcuts();
		bindCanvasEvents();
		bindRedrawEvents();
		observeSlideChanges();
		resizeCanvas();
		updateActiveState();
	});

	function ensureStyle() {
		if (runtimeDocument.getElementById(marker)) return;

		const style = runtimeDocument.createElement('style');
		style.id = marker;
		style.textContent = `
.marp-slides-annotation-host {
  position: relative;
}
.marp-slides-viewport-pan-enabled {
  overscroll-behavior: contain;
}
html.marp-slides-viewport-pan-enabled,
body.marp-slides-viewport-pan-enabled,
.marp-slides-annotation-host-scoped.marp-slides-viewport-pan-enabled {
  overflow: auto !important;
}
.marp-slides-annotation-canvas,
.marp-slides-laser-canvas {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  touch-action: none;
}
.marp-slides-laser-canvas {
  z-index: 2147483002;
}
.marp-slides-annotation-host-scoped > .marp-slides-annotation-canvas,
.marp-slides-annotation-host-scoped > .marp-slides-laser-canvas {
  position: absolute;
}
.marp-slides-annotation-canvas[data-active="true"] {
  pointer-events: auto;
  cursor: crosshair;
}
.marp-slides-annotation-canvas[data-tool="laser"] {
  cursor: crosshair;
}
.marp-slides-annotation-toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483001;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px;
  color: #fff;
  background: rgba(0, 0, 0, 0.68);
  border-radius: 10px;
  user-select: none;
}
.marp-slides-annotation-host-scoped > .marp-slides-annotation-toolbar {
  position: absolute;
}
.marp-slides-annotation-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: normal;
  opacity: 1 !important;
  vertical-align: middle;
}
.bespoke-marp-osc {
  z-index: 2147483001 !important;
}
body[data-bespoke-view=""] .bespoke-marp-parent > .bespoke-marp-osc,
body[data-bespoke-view=next] .bespoke-marp-parent > .bespoke-marp-osc {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  bottom: 50px !important;
  transform: translateX(-50%) !important;
}
body[data-marp-slides-annotation-active="true"] .bespoke-marp-parent.bespoke-marp-inactive {
  cursor: auto !important;
}
body[data-marp-slides-annotation-active="true"] .bespoke-marp-parent.bespoke-marp-inactive > .bespoke-marp-osc {
  opacity: 1 !important;
  pointer-events: auto !important;
}
.marp-slides-annotation-button {
  appearance: none;
  width: 34px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.9;
  touch-action: manipulation;
}
.marp-slides-annotation-button:hover,
.marp-slides-annotation-button:focus-visible {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}
.marp-slides-annotation-button[aria-pressed="true"] {
  color: #111;
  background: #ffd54f;
  border-color: #ffd54f;
}
.marp-slides-annotation-button[data-tool="laser"][aria-pressed="true"] {
  color: #fff;
  background: #f44336;
  border-color: #ff8a80;
}
.marp-slides-annotation-button svg {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media print {
  .marp-slides-annotation-canvas,
  .marp-slides-laser-canvas,
  .marp-slides-annotation-toolbar,
  .marp-slides-annotation-controls {
    display: none !important;
  }
}`;
		(runtimeDocument.head || runtimeDocument.body).appendChild(style);
	}

	function onReady(callback: () => void) {
		if (runtimeDocument.readyState === 'loading') {
			runtimeDocument.addEventListener('DOMContentLoaded', callback, { once: true });
		} else {
			callback();
		}
	}

	function bindViewportWheelPanAndGestureGuard() {
		runtimeWindow.addEventListener('wheel', (event) => {
			if (!isEventInsideHost(event)) return;

			event.stopPropagation();
			event.stopImmediatePropagation();

			if (event.ctrlKey) {
				event.preventDefault();
				zoomViewportByWheel(event);
				return;
			}

			queueWheelPanFallback(event);
		}, { capture: true, passive: false });
	}

	function bindMouseDragViewportPan() {
		const startViewportPan = (event: MouseEvent | PointerEvent, pointerId: number | null) => {
			if (!isEventInsideHost(event) || activeTool) return;
			if (event.button !== 0) return;
			if (isInteractiveTarget(event.target)) return;

			const scroller = getViewportScroller();
			viewportPan = {
				pointerId,
				startX: event.clientX,
				startY: event.clientY,
				scrollLeft: scroller.scrollLeft,
				scrollTop: scroller.scrollTop,
				started: false,
			};
		};

		const moveViewportPan = (event: MouseEvent | PointerEvent) => {
			if (!viewportPan) return;
			if (viewportPan.pointerId !== null && 'pointerId' in event && event.pointerId !== viewportPan.pointerId) return;

			const deltaX = event.clientX - viewportPan.startX;
			const deltaY = event.clientY - viewportPan.startY;
			if (!viewportPan.started && Math.hypot(deltaX, deltaY) < 3) return;

			if (!viewportPan.started) {
				viewportPan.started = true;
				runtimeDocument.body.style.cursor = 'grabbing';
				runtimeDocument.body.style.userSelect = 'none';
			}

			panViewportBy(viewportPan.scrollLeft - deltaX - getViewportScroller().scrollLeft, viewportPan.scrollTop - deltaY - getViewportScroller().scrollTop);

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		};

		const endViewportPan = (event: MouseEvent | PointerEvent) => {
			if (!viewportPan) return;
			if (viewportPan.pointerId !== null && 'pointerId' in event && event.pointerId !== viewportPan.pointerId) return;

			const wasStarted = viewportPan.started;
			viewportPan = null;
			runtimeDocument.body.style.cursor = '';
			runtimeDocument.body.style.userSelect = '';

			if (wasStarted) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			}
		};

		runtimeDocument.addEventListener('pointerdown', (event) => {
			if (event.pointerType === 'mouse') startViewportPan(event, event.pointerId);
		}, true);
		runtimeDocument.addEventListener('pointermove', moveViewportPan, true);
		runtimeDocument.addEventListener('pointerup', endViewportPan, true);
		runtimeDocument.addEventListener('pointercancel', endViewportPan, true);
		runtimeDocument.addEventListener('mousedown', (event) => {
			if (!viewportPan) startViewportPan(event, null);
		}, true);
		runtimeDocument.addEventListener('mousemove', moveViewportPan, true);
		runtimeDocument.addEventListener('mouseup', endViewportPan, true);
	}

	function bindGestureNavigationGuard() {
		let singleTouchStarted = false;
		let multiTouch = false;

		runtimeDocument.addEventListener('touchstart', (event) => {
			if (!isEventInsideHost(event) || activeTool || isInteractiveTarget(event.target)) return;

			multiTouch = event.touches.length > 1;
			singleTouchStarted = event.touches.length === 1;
			pinchZoom = multiTouch ? getInitialPinchZoom(event.touches) : null;
			touchViewportPan = singleTouchStarted && isViewportScrollable()
				? getInitialTouchViewportPan(event.touches[0])
				: null;
		}, { capture: true, passive: true });

		runtimeDocument.addEventListener('touchmove', (event) => {
			if (!isEventInsideHost(event) || activeTool || isInteractiveTarget(event.target)) return;

			if (event.touches.length > 1) {
				multiTouch = true;
				if (!pinchZoom) pinchZoom = getInitialPinchZoom(event.touches);
				if (pinchZoom) {
					const distance = getTouchDistance(event.touches);
					const center = getTouchCenter(event.touches);
					zoomViewport(pinchZoom.startScale * distance / pinchZoom.startDistance, center.x, center.y);
				}

				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				return;
			}

			if (multiTouch) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				return;
			}

			if (!singleTouchStarted) return;

			if (touchViewportPan && event.touches.length === 1) {
				panViewportWithTouch(event.touches[0]);
			}

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		}, { capture: true, passive: false });

		const endTouchGesture = (event: TouchEvent) => {
			if (!isEventInsideHost(event) || activeTool || isInteractiveTarget(event.target)) return;

			if (event.touches.length > 0) return;

			if (multiTouch) {
				multiTouch = false;
				pinchZoom = null;
				singleTouchStarted = false;
				touchViewportPan = null;
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				return;
			}

			if (singleTouchStarted) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			}

			singleTouchStarted = false;
			touchViewportPan = null;
		};

		runtimeDocument.addEventListener('touchend', endTouchGesture, { capture: true, passive: false });
		runtimeDocument.addEventListener('touchcancel', endTouchGesture, { capture: true, passive: false });

		['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
			runtimeDocument.addEventListener(eventName, (event) => {
				if (!isEventInsideHost(event)) return;

				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			}, { capture: true, passive: false });
		});
	}

	function queueWheelPanFallback(event: WheelEvent) {
		const delta = normalizeWheelDelta(event);
		const nestedScroller = getNestedWheelScroller(event.target);
		if (nestedScroller && canScrollWithWheel(nestedScroller, delta)) return;

		const scroller = getViewportScroller();
		const startLeft = scroller.scrollLeft;
		const startTop = scroller.scrollTop;
		const viewport = runtimeWindow.visualViewport;
		const startViewportLeft = viewport?.pageLeft || runtimeWindow.scrollX || 0;
		const startViewportTop = viewport?.pageTop || runtimeWindow.scrollY || 0;

		runtimeWindow.requestAnimationFrame(() => {
			const currentViewportLeft = viewport?.pageLeft || runtimeWindow.scrollX || 0;
			const currentViewportTop = viewport?.pageTop || runtimeWindow.scrollY || 0;
			const moved = Math.abs(scroller.scrollLeft - startLeft) > 0.5
				|| Math.abs(scroller.scrollTop - startTop) > 0.5
				|| Math.abs(currentViewportLeft - startViewportLeft) > 0.5
				|| Math.abs(currentViewportTop - startViewportTop) > 0.5;

			if (!moved) {
				panViewportBy(delta.deltaX, delta.deltaY);
			}
		});
	}


	function getNestedWheelScroller(target: EventTarget | null) {
		const element = target instanceof Element ? target : null;
		if (!element) return null;

		let current = element instanceof HTMLElement ? element : element.parentElement;
		while (current && current !== host) {
			if (isNestedScrollableElement(current)) {
				return current;
			}

			current = current.parentElement;
		}

		return null;
	}

	function isNestedScrollableElement(element: HTMLElement) {
		const style = runtimeWindow.getComputedStyle(element);
		const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
		return canScrollY || canScrollX;
	}

	function canScrollWithWheel(element: HTMLElement, delta: { deltaX: number; deltaY: number }) {
		return canScrollAxis(element.scrollLeft, element.clientWidth, element.scrollWidth, delta.deltaX)
			|| canScrollAxis(element.scrollTop, element.clientHeight, element.scrollHeight, delta.deltaY);
	}

	function canScrollAxis(position: number, viewportSize: number, contentSize: number, delta: number) {
		if (Math.abs(delta) < 0.5 || contentSize <= viewportSize + 1) return false;
		if (delta < 0) return position > 1;
		return position + viewportSize < contentSize - 1;
	}

	function normalizeWheelDelta(event: WheelEvent) {
		let scale = 1;

		if (event.deltaMode === 1) {
			scale = 16;
		} else if (event.deltaMode === 2) {
			scale = runtimeWindow.innerHeight;
		}

		return {
			deltaX: event.deltaX * scale,
			deltaY: event.deltaY * scale,
		};
	}

	function zoomViewportByWheel(event: WheelEvent) {
		const delta = normalizeWheelDelta(event);
		const nextScale = viewportZoomScale * Math.exp(-delta.deltaY * 0.001);
		zoomViewport(nextScale, event.clientX, event.clientY);
	}

	function zoomViewport(nextScale: number, clientX: number, clientY: number) {
		nextScale = clampViewportZoomScale(nextScale);
		if (Math.abs(nextScale - viewportZoomScale) < 0.001) return;

		const scroller = getViewportScroller();
		const oldScale = viewportZoomScale;
		const contentX = (scroller.scrollLeft + clientX) / oldScale;
		const contentY = (scroller.scrollTop + clientY) / oldScale;

		viewportZoomScale = nextScale;
		applyViewportZoomScale();
		setViewportScroll(contentX * nextScale - clientX, contentY * nextScale - clientY);
		resizeCanvas();
	}

	function clampViewportZoomScale(scale: number) {
		return Math.min(4, Math.max(1, scale));
	}

	function applyViewportZoomScale() {
		const zoomStyle = viewportZoomScale === 1 ? '' : `${viewportZoomScale * 100}%`;
		(runtimeDocument.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = '';
		runtimeDocument.body.style.minWidth = viewportZoomScale === 1 ? '' : `${viewportZoomScale * 100}vw`;
		runtimeDocument.body.style.minHeight = viewportZoomScale === 1 ? '' : `${viewportZoomScale * 100}vh`;

		getZoomableSlides().forEach((slide) => {
			slide.style.width = zoomStyle;
			slide.style.height = zoomStyle;
		});
	}

	function getZoomableSlides() {
		return Array.from(queryRoot.querySelectorAll('.bespoke-marp-parent > svg.bespoke-marp-slide, .bespoke-marp-parent > svg[data-marpit-svg]'))
			.filter((slide): slide is SVGSVGElement => slide instanceof SVGSVGElement);
	}

	function getInitialPinchZoom(touches: TouchList) {
		if (touches.length < 2) return null;

		const distance = getTouchDistance(touches);
		if (distance <= 0) return null;

		return { startDistance: distance, startScale: viewportZoomScale };
	}

	function getTouchDistance(touches: TouchList) {
		if (touches.length < 2) return 0;

		const first = touches[0];
		const second = touches[1];
		return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
	}

	function getTouchCenter(touches: TouchList) {
		const first = touches[0];
		const second = touches[1];
		return {
			x: (first.clientX + second.clientX) / 2,
			y: (first.clientY + second.clientY) / 2,
		};
	}

	function getInitialTouchViewportPan(touch: Touch) {
		const scroller = getViewportScroller();
		return {
			startX: touch.clientX,
			startY: touch.clientY,
			scrollLeft: scroller.scrollLeft,
			scrollTop: scroller.scrollTop,
			started: false,
		};
	}

	function panViewportWithTouch(touch: Touch) {
		if (!touchViewportPan) return;

		const deltaX = touch.clientX - touchViewportPan.startX;
		const deltaY = touch.clientY - touchViewportPan.startY;
		if (!touchViewportPan.started && Math.hypot(deltaX, deltaY) < 3) return;

		touchViewportPan.started = true;
		panViewportBy(touchViewportPan.scrollLeft - deltaX - getViewportScroller().scrollLeft, touchViewportPan.scrollTop - deltaY - getViewportScroller().scrollTop);
	}

	function panViewportBy(deltaX: number, deltaY: number) {
		if (!scopedHost) {
			runtimeWindow.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
		}

		getViewportScrollers().forEach((scroller) => {
			scroller.scrollLeft += deltaX;
			scroller.scrollTop += deltaY;
		});
	}

	function setViewportScroll(left: number, top: number) {
		if (!scopedHost) {
			runtimeWindow.scrollTo({ left, top, behavior: 'auto' });
		}

		getViewportScrollers().forEach((scroller) => {
			scroller.scrollLeft = left;
			scroller.scrollTop = top;
		});
	}

	function getViewportScrollers() {
		const scrollCandidates = scopedHost
			? [host]
			: [runtimeDocument.scrollingElement, runtimeDocument.documentElement, runtimeDocument.body, host];

		return scrollCandidates.filter((scroller, index, list): scroller is HTMLElement => {
			return !!scroller && list.indexOf(scroller) === index;
		});
	}

	function getViewportScroller() {
		return scopedHost ? host : (runtimeDocument.scrollingElement || runtimeDocument.documentElement) as HTMLElement;
	}

	function isViewportScrollable() {
		const scroller = getViewportScroller();
		return viewportZoomScale > 1
			|| scroller.scrollWidth > scroller.clientWidth
			|| scroller.scrollHeight > scroller.clientHeight
			|| ((runtimeWindow.visualViewport?.scale || 1) > 1);
	}

	function isEventInsideHost(event: Event) {
		if (!scopedHost) return true;

		const target = event.target as Node | null;
		return !!target && host.contains(target);
	}

	function isInteractiveTarget(target: EventTarget | null) {
		const element = target as Element | null;
		if (!element || typeof element.closest !== 'function') return false;

		return Boolean(element.closest('button,a,input,select,textarea,[contenteditable="true"],.bespoke-marp-osc,.marp-slides-annotation-controls,.marp-slides-annotation-toolbar,.marp-slides-annotation-button'));
	}

	function isEditableTarget(target: EventTarget | null) {
		const element = target as Element | null;
		if (!element || typeof element.closest !== 'function') return false;

		return Boolean(element.closest('input,select,textarea,[contenteditable="true"]'));
	}

	function createAnnotationControls() {
		const bespokeToolbars = Array.from(queryRoot.querySelectorAll('.bespoke-marp-osc'));

		if (bespokeToolbars.length > 0) {
			bespokeToolbars.forEach((toolbar) => {
				if (!toolbar.querySelector('.marp-slides-annotation-controls')) {
					toolbar.appendChild(createControlGroup());
				}
			});
			return;
		}

		const fallbackToolbar = runtimeDocument.createElement('div');
		fallbackToolbar.className = 'marp-slides-annotation-toolbar';
		fallbackToolbar.appendChild(createControlGroup());
		host.appendChild(fallbackToolbar);
	}

	function createControlGroup() {
		const group = runtimeDocument.createElement('span');
		group.className = 'marp-slides-annotation-controls';

		Object.keys(tools).forEach((toolName) => {
			group.appendChild(createToolButton(toolName));
		});

		group.appendChild(createClearButton());
		return group;
	}

	function getShortcutLabel(label: string, shortcut: string) {
		return `${label} (${shortcut.toUpperCase()})`;
	}

	function toggleTool(toolName: string) {
		activeTool = activeTool === toolName ? null : toolName;
		activeAnnotation = null;
		activePointerId = null;
		updateActiveState();
	}

	function clearCurrentAnnotations() {
		const annotations = annotationsBySlide.get(getSlideKey());
		if (!annotations || annotations.length === 0) return;

		activeAnnotation = null;
		activePointerId = null;
		pushUndoEntry({ action: 'clear', annotations: annotations.slice() });
		annotationsBySlide.delete(getSlideKey());
		clearLaserTrail();
		scheduleRender();
	}

	function bindKeyboardShortcuts() {
		runtimeDocument.addEventListener('keydown', (event) => {
			if (!isEventInsideHost(event) || isEditableTarget(event.target)) return;

			const key = event.key.toLowerCase();
			if (key === 'z' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.repeat) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				undoCurrentSlideChange();
				return;
			}

			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;

			const toolName = Object.keys(toolShortcuts).find((name) => toolShortcuts[name] === key);
			if (!toolName && key !== clearShortcut) return;

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			if (toolName) {
				toggleTool(toolName);
				return;
			}

			clearCurrentAnnotations();
		}, true);
	}

	function createToolButton(toolName: string) {
		const button = runtimeDocument.createElement('button');
		button.type = 'button';
		button.className = 'marp-slides-annotation-button';
		button.dataset.tool = toolName;
		button.tabIndex = -1;
		button.title = getShortcutLabel(tools[toolName].label, toolShortcuts[toolName]);
		button.innerHTML = tools[toolName].icon;
		button.setAttribute('aria-label', getShortcutLabel(tools[toolName].label, toolShortcuts[toolName]));
		button.setAttribute('aria-pressed', 'false');
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			toggleTool(toolName);
		});
		return button;
	}

	function createClearButton() {
		const button = runtimeDocument.createElement('button');
		button.type = 'button';
		button.className = 'marp-slides-annotation-button';
		button.tabIndex = -1;
		button.title = getShortcutLabel('Clear annotations', clearShortcut);
		button.innerHTML = clearIcon;
		button.setAttribute('aria-label', getShortcutLabel('Clear annotations', clearShortcut));
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			clearCurrentAnnotations();
		});
		return button;
	}

	function bindCanvasEvents() {
			if (!canvas) return;

			canvas.addEventListener('pointerdown', (event) => {
				if (!activeTool || !tools[activeTool]) return;

				const tool = tools[activeTool];
				activePointerId = event.pointerId;

				if (tool.mode === 'laser') {
					laserPointerId = event.pointerId;
					appendLaserPoint(event, true);
					capturePointer(event);
					event.preventDefault();
					event.stopPropagation();
					requestLaserAnimation();
					return;
				}

				const point = getPoint(event);
				activeAnnotation = tool.mode === 'shape'
					? { kind: 'shape', tool: activeTool as ShapeToolName, start: point, end: point }
					: { kind: 'freehand', tool: activeTool as FreehandToolName, points: [point] };
				getCurrentSlideAnnotations().push(activeAnnotation);
				capturePointer(event);
				event.preventDefault();
				event.stopPropagation();
				scheduleRender();
			});

			canvas.addEventListener('pointermove', (event) => {
				if (laserPointerId === event.pointerId) {
					const events = typeof event.getCoalescedEvents === 'function'
						? event.getCoalescedEvents()
						: [event];
					events.forEach((coalescedEvent) => appendLaserPoint(coalescedEvent));
					event.preventDefault();
					event.stopPropagation();
					requestLaserAnimation();
					return;
				}

				if (!activeAnnotation || event.pointerId !== activePointerId) return;

				const point = getPoint(event);
				if (activeAnnotation.kind === 'shape') {
					activeAnnotation.end = point;
				} else {
					activeAnnotation.points.push(point);
				}
				event.preventDefault();
				event.stopPropagation();
				scheduleRender();
			});

			const endStroke = (event: PointerEvent) => {
				if (laserPointerId === event.pointerId) {
					releasePointer(event);
					laserPointerId = null;
					activePointerId = null;
					event.preventDefault();
					event.stopPropagation();
					requestLaserAnimation();
					return;
				}

				if (!activeAnnotation || event.pointerId !== activePointerId) return;

				const completedAnnotation = activeAnnotation;
				let shouldRecordUndo = true;
				if (completedAnnotation.kind === 'shape') {
					completedAnnotation.end = getPoint(event);
					if (isShapeTooSmall(completedAnnotation)) {
						removeAnnotation(completedAnnotation);
						shouldRecordUndo = false;
					}
				}

				if (shouldRecordUndo) {
					pushUndoEntry({ action: 'add', annotation: completedAnnotation });
				}

				releasePointer(event);
				activeAnnotation = null;
				activePointerId = null;
				event.preventDefault();
				event.stopPropagation();
				scheduleRender();
			};

			canvas.addEventListener('pointerup', endStroke);
			canvas.addEventListener('pointercancel', endStroke);

			['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((eventName) => {
				canvas?.addEventListener(eventName, (event) => {
					if (!activeTool) return;

					event.preventDefault();
					event.stopPropagation();
				}, { passive: false });
			});
		}

function capturePointer(event: PointerEvent) {
		if (canvas?.setPointerCapture) {
			canvas.setPointerCapture(event.pointerId);
		}
	}

	function releasePointer(event: PointerEvent) {
		if (canvas?.releasePointerCapture) {
			canvas.releasePointerCapture(event.pointerId);
		}
	}

	function bindRedrawEvents() {
		runtimeWindow.addEventListener('resize', resizeCanvas);
		runtimeDocument.addEventListener('fullscreenchange', resizeCanvas);
		runtimeWindow.addEventListener('hashchange', queueRenderAfterNavigation);
		runtimeDocument.addEventListener('keydown', queueRenderAfterNavigation, true);
		runtimeDocument.addEventListener('click', queueRenderAfterNavigation, true);
	}

	function observeSlideChanges() {
		const slides = Array.from(queryRoot.querySelectorAll('.bespoke-marp-slide'));
		if (slides.length === 0 || typeof MutationObserver === 'undefined') return;

		const observer = new MutationObserver(queueRenderAfterNavigation);
		slides.forEach((slide) => {
			observer.observe(slide, { attributes: true, attributeFilter: ['class'] });
		});
	}

	function queueRenderAfterNavigation() {
		runtimeWindow.setTimeout(() => {
			const slideKey = getSlideKey();
			if (slideKey !== lastSlideKey) {
				lastSlideKey = slideKey;
				clearLaserTrail();
			}
			scheduleRender();
		}, 0);
	}

	function updateActiveState() {
		if (canvas) {
			canvas.dataset.active = activeTool ? 'true' : 'false';
			canvas.dataset.tool = activeTool || '';
		}

		if (activeTool) {
			runtimeDocument.body.setAttribute('data-marp-slides-annotation-active', 'true');
		} else {
			runtimeDocument.body.removeAttribute('data-marp-slides-annotation-active');
		}

		queryRoot.querySelectorAll('.marp-slides-annotation-button[data-tool]').forEach((button) => {
			button.setAttribute('aria-pressed', (button as HTMLElement).dataset.tool === activeTool ? 'true' : 'false');
		});
	}

	function resizeCanvas() {
		const rect = getDrawingRect();
		resizeDrawingCanvas(canvas, context, rect);
		resizeDrawingCanvas(laserCanvas, laserContext, rect);
		scheduleRender();
		renderLaserTrail();
	}

	function resizeDrawingCanvas(targetCanvas: HTMLCanvasElement | null, targetContext: CanvasRenderingContext2D | null, rect: { width: number; height: number }) {
		if (!targetCanvas || !targetContext) return;

		const ratio = runtimeWindow.devicePixelRatio || 1;
		targetCanvas.width = Math.round(rect.width * ratio);
		targetCanvas.height = Math.round(rect.height * ratio);
		targetCanvas.style.width = rect.width + 'px';
		targetCanvas.style.height = rect.height + 'px';
		targetContext.setTransform(ratio, 0, 0, ratio, 0, 0);
	}

	function getDrawingRect() {
		if (scopedHost) {
			const rect = host.getBoundingClientRect();
			return {
				left: rect.left,
				top: rect.top,
				width: Math.max(1, rect.width || runtimeWindow.innerWidth),
				height: Math.max(1, rect.height || runtimeWindow.innerHeight),
			};
		}

		return { left: 0, top: 0, width: Math.max(1, runtimeWindow.innerWidth), height: Math.max(1, runtimeWindow.innerHeight) };
	}

	function scheduleRender() {
		if (renderFrame) return;

		renderFrame = runtimeWindow.requestAnimationFrame(() => {
			renderFrame = 0;
			renderAnnotations();
		});
	}

	function requestLaserAnimation() {
		if (laserFrame) return;

		laserFrame = runtimeWindow.requestAnimationFrame(() => {
			laserFrame = 0;
			pruneLaserTrail();
			renderLaserTrail();
			if (laserPointerId !== null || laserTrail.length > 0) {
				requestLaserAnimation();
			}
		});
	}

	function renderAnnotations() {
			if (!canvas || !context) return;

			context.save();
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.restore();

			const slideKey = getSlideKey();
			if (slideKey !== lastSlideKey) {
				lastSlideKey = slideKey;
				clearLaserTrail();
			}

			const annotations = annotationsBySlide.get(slideKey) || [];
			annotations.forEach(drawAnnotation);
		}

		function drawAnnotation(annotation: Annotation) {
			if (annotation.kind === 'shape') {
				drawShape(annotation);
				return;
			}

			drawFreehand(annotation);
		}

		function drawFreehand(annotation: FreehandAnnotation) {
			const ctx = context;
			if (!ctx) return;

			const tool = tools[annotation.tool];
			if (!tool || annotation.points.length === 0) return;

			const rect = getDrawingRect();
			ctx.save();
			ctx.globalAlpha = tool.alpha;
			ctx.globalCompositeOperation = tool.composite;
			ctx.strokeStyle = tool.color;
			ctx.lineWidth = tool.width;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();

			annotation.points.forEach((point, index) => {
				const x = point.x * rect.width;
				const y = point.y * rect.height;

				if (index === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			});

			if (annotation.points.length === 1) {
				const point = annotation.points[0];
				ctx.lineTo((point.x * rect.width) + 0.01, (point.y * rect.height) + 0.01);
			}

			ctx.stroke();
			ctx.restore();
		}

		function drawShape(annotation: ShapeAnnotation) {
			const ctx = context;
			if (!ctx) return;

			const tool = tools[annotation.tool];
			if (!tool) return;

			const bounds = getShapeBounds(annotation);
			if (bounds.width <= 0 || bounds.height <= 0) return;

			ctx.save();
			ctx.globalAlpha = tool.alpha;
			ctx.globalCompositeOperation = tool.composite;
			ctx.strokeStyle = tool.color;
			ctx.lineWidth = tool.width;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			if (annotation.tool === 'rectangle') {
				ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
			} else {
				ctx.beginPath();
				ctx.ellipse(bounds.left + (bounds.width / 2), bounds.top + (bounds.height / 2), bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2);
				ctx.stroke();
			}

			ctx.restore();
		}

		function getShapeBounds(annotation: ShapeAnnotation) {
			const rect = getDrawingRect();
			const startX = annotation.start.x * rect.width;
			const startY = annotation.start.y * rect.height;
			const endX = annotation.end.x * rect.width;
			const endY = annotation.end.y * rect.height;

			return {
				left: Math.min(startX, endX),
				top: Math.min(startY, endY),
				width: Math.abs(endX - startX),
				height: Math.abs(endY - startY),
			};
		}

		function isShapeTooSmall(annotation: ShapeAnnotation) {
			const bounds = getShapeBounds(annotation);
			return bounds.width < shapeMinSize && bounds.height < shapeMinSize;
		}

function renderLaserTrail() {
		const ctx = laserContext;
		if (!laserCanvas || !ctx) return;

		clearLaserCanvas();
		if (laserTrail.length === 0) return;

		const now = getNow();
		const rect = getDrawingRect();
		const visiblePoints: Array<{ x: number; y: number; alpha: number; startsStroke?: boolean }> = [];

		for (const point of laserTrail) {
			const alpha = Math.max(0, 1 - ((now - point.time) / laserLifetime));
			if (alpha <= 0) continue;

			visiblePoints.push({
				x: point.x * rect.width,
				y: point.y * rect.height,
				alpha,
				startsStroke: point.startsStroke,
			});
		}

		if (visiblePoints.length === 0) return;

		const lastPoint = visiblePoints[visiblePoints.length - 1];

		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#ff1f1f';

		if (visiblePoints.length > 1) {
			const strokeLaserPath = () => {
				ctx.beginPath();
				let drawingStroke = false;

				for (let index = 0; index < visiblePoints.length; index++) {
					const point = visiblePoints[index];
					const nextPoint = visiblePoints[index + 1];

					if (!drawingStroke || point.startsStroke) {
						ctx.moveTo(point.x, point.y);
						drawingStroke = true;
						continue;
					}

					if (nextPoint && !nextPoint.startsStroke) {
						ctx.quadraticCurveTo(point.x, point.y, (point.x + nextPoint.x) / 2, (point.y + nextPoint.y) / 2);
					} else {
						ctx.lineTo(point.x, point.y);
					}
				}

				ctx.stroke();
			};

			ctx.globalAlpha = lastPoint.alpha * 0.22;
			ctx.lineWidth = 9;
			strokeLaserPath();
			ctx.globalAlpha = lastPoint.alpha * 0.58;
			ctx.lineWidth = 4.5;
			strokeLaserPath();
		}

		if (lastPoint) {
			ctx.globalAlpha = lastPoint.alpha;
			ctx.shadowColor = 'rgba(255, 0, 0, 0.88)';
			ctx.shadowBlur = 18;
			ctx.fillStyle = '#ff1f1f';
			ctx.beginPath();
			ctx.arc(lastPoint.x, lastPoint.y, 5.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 6;
			ctx.fillStyle = '#fff4f4';
			ctx.beginPath();
			ctx.arc(lastPoint.x, lastPoint.y, 1.8, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	function clearLaserCanvas() {
		if (!laserCanvas || !laserContext) return;

		laserContext.save();
		laserContext.setTransform(1, 0, 0, 1, 0, 0);
		laserContext.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
		laserContext.restore();
	}

	function appendLaserPoint(event: PointerEvent, startsStroke = false) {
		const point = getPoint(event);
		const time = getNow();
		const previous = laserTrail[laserTrail.length - 1];

		if (previous && !startsStroke) {
			const rect = getDrawingRect();
			const distance = Math.hypot((point.x - previous.x) * rect.width, (point.y - previous.y) * rect.height);
			if (distance < laserMinDistance) return;
		}

		laserTrail.push({ ...point, time, startsStroke });
		if (laserTrail.length > laserMaxPoints) {
			laserTrail.splice(0, laserTrail.length - laserMaxPoints);
		}

		pruneLaserTrail(time);
	}

	function pruneLaserTrail(now = getNow()) {
		laserTrail = laserTrail.filter((point) => now - point.time <= laserLifetime);
	}

	function clearLaserTrail() {
		laserTrail = [];
		laserPointerId = null;
		clearLaserCanvas();
	}

	function undoCurrentSlideChange() {
		const undoStack = undoStackBySlide.get(getSlideKey());
		if (!undoStack || undoStack.length === 0) return;

		const entry = undoStack.pop();
		if (!entry) return;

		activeAnnotation = null;
		activePointerId = null;

		if (entry.action === 'add') {
			removeAnnotation(entry.annotation);
		} else {
			annotationsBySlide.set(getSlideKey(), entry.annotations.slice());
		}

		scheduleRender();
	}

	function getCurrentSlideUndoStack() {
		const key = getSlideKey();
		const undoStack = undoStackBySlide.get(key) || [];
		undoStackBySlide.set(key, undoStack);
		return undoStack;
	}

	function pushUndoEntry(entry: UndoEntry) {
		const undoStack = getCurrentSlideUndoStack();
		undoStack.push(entry);
		if (undoStack.length > undoHistoryLimit) {
			undoStack.splice(0, undoStack.length - undoHistoryLimit);
		}
	}

	function removeAnnotation(annotation: Annotation) {
		const annotations = annotationsBySlide.get(getSlideKey());
		if (!annotations) return;

		const index = annotations.indexOf(annotation);
		if (index >= 0) {
			annotations.splice(index, 1);
		}
	}

	function getCurrentSlideAnnotations() {
		const key = getSlideKey();
		const annotations = annotationsBySlide.get(key) || [];
		annotationsBySlide.set(key, annotations);
		return annotations;
	}

	function getSlideKey() {
		const activeSlide = queryRoot.querySelector('.bespoke-marp-slide.bespoke-marp-active');
		const slides = Array.from(queryRoot.querySelectorAll('.bespoke-marp-slide'));

		if (activeSlide && slides.length > 0) {
			return 'slide-' + slides.indexOf(activeSlide);
		}

		if (runtimeWindow.location.hash) {
			return 'hash-' + runtimeWindow.location.hash;
		}

		return 'global';
	}

	function getPoint(event: PointerEvent) {
		const rect = getDrawingRect();
		return {
			x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
			y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
		};
	}

	function getNow() {
		return runtimeWindow.performance?.now ? runtimeWindow.performance.now() : Date.now();
	}
}

async function getEmbeddedImageDataURI(target: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string | null> {
	if (shouldSkipImageTarget(target)) {
		return null;
	}

	const imagePath = await resolveLocalImagePath(target, sourceFile, app);

	if (!imagePath) {
		return null;
	}

	const embeddedImage = await readEmbeddedImage(imagePath, settings);

	if (!embeddedImage) {
		return null;
	}

	return `data:${embeddedImage.mimeType};base64,${embeddedImage.buffer.toString('base64')}`;
}

async function replaceAsync(source: string, regex: RegExp, replacer: (...args: string[]) => Promise<string>): Promise<string> {
	const replacements = await Promise.all([...source.matchAll(regex)].map((match) => replacer(...match)));
	let replacementIndex = 0;
	return source.replace(regex, () => replacements[replacementIndex++]);
}

export async function embedMarkdownImages(markdown: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string> {
	return transformMarkdownImageDestinations(markdown, async (rawDestination) => {
		const destination = parseMarkdownDestination(rawDestination);

		if (!destination || shouldSkipImageTarget(destination.target)) {
			return null;
		}

		const imagePath = await resolveLocalImagePath(destination.target, sourceFile, app);

		if (!imagePath) {
			return null;
		}

		const embeddedImage = await readEmbeddedImage(imagePath, settings);

		if (!embeddedImage) {
			return null;
		}

		return destination.build(`data:${embeddedImage.mimeType};base64,${embeddedImage.buffer.toString('base64')}`);
	});
}

export async function resolveMarkdownImageResourcePaths(markdown: string, sourceFile: TFile, app: App): Promise<string> {
	return transformMarkdownImageDestinations(markdown, async (rawDestination) => {
		const destination = parseMarkdownDestination(rawDestination);

		if (!destination || shouldSkipImageTarget(destination.target)) {
			return null;
		}

		const imagePath = await resolveLocalImagePath(destination.target, sourceFile, app);
		const resourcePath = imagePath ? getVaultResourcePath(imagePath, app) : null;

		return resourcePath ? destination.build(resourcePath) : null;
	});
}

export async function transformMarkdownImageDestinations(
	markdown: string,
	transformDestination: (rawDestination: string) => Promise<string | null>
): Promise<string> {
	let inFence = false;
	const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];

	if (lines[lines.length - 1] === '') {
		lines.pop();
	}

	const transformedLines: string[] = [];

	for (const lineWithEnding of lines) {
		const endingMatch = lineWithEnding.match(/(\r\n|\n|\r)$/);
		const ending = endingMatch ? endingMatch[0] : '';
		const line = ending ? lineWithEnding.slice(0, -ending.length) : lineWithEnding;
		const isFence = /^(```|~~~)/.test(line.trim());

		if (isFence) {
			inFence = !inFence;
			transformedLines.push(lineWithEnding);
			continue;
		}

		if (inFence) {
			transformedLines.push(lineWithEnding);
			continue;
		}

		transformedLines.push(`${await transformMarkdownImageDestinationsInLine(line, transformDestination)}${ending}`);
	}

	return transformedLines.join('');
}

async function transformMarkdownImageDestinationsInLine(
	line: string,
	transformDestination: (rawDestination: string) => Promise<string | null>
): Promise<string> {
	const imageRegex = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
	let result = '';
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = imageRegex.exec(line)) !== null) {
		const fullMatch = match[0];
		const rawDestination = match[1];
		const transformedDestination = await transformDestination(rawDestination);
		let replacement = fullMatch;

		if (transformedDestination) {
			const destinationIndex = fullMatch.lastIndexOf(rawDestination);
			replacement = `${fullMatch.slice(0, destinationIndex)}${transformedDestination}${fullMatch.slice(destinationIndex + rawDestination.length)}`;
		}

		result += `${line.slice(lastIndex, match.index)}${replacement}`;
		lastIndex = match.index + fullMatch.length;
	}

	return `${result}${line.slice(lastIndex)}`;
}

function parseMarkdownDestination(rawDestination: string): MarkdownDestination | null {
	const leadingWhitespaceLength = rawDestination.length - rawDestination.trimStart().length;
	const trailingWhitespaceLength = rawDestination.length - rawDestination.trimEnd().length;
	const leadingWhitespace = rawDestination.slice(0, leadingWhitespaceLength);
	const trailingWhitespace = trailingWhitespaceLength > 0 ? rawDestination.slice(-trailingWhitespaceLength) : '';
	const trimmed = rawDestination.trim();

	if (trimmed.startsWith('<')) {
		const closingIndex = trimmed.indexOf('>');

		if (closingIndex <= 1) {
			return null;
		}

		const target = trimmed.slice(1, closingIndex);
		const suffix = trimmed.slice(closingIndex + 1);
		return {
			target,
			build: (replacement) => `${leadingWhitespace}<${replacement}>${suffix}${trailingWhitespace}`,
		};
	}

	const titledDestination = trimmed.match(/^(\S+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))$/);

	if (titledDestination) {
		return {
			target: titledDestination[1],
			build: (replacement) => `${leadingWhitespace}${replacement}${titledDestination[2]}${trailingWhitespace}`,
		};
	}

	if (trimmed === '') {
		return null;
	}

	return {
		target: trimmed,
		build: (replacement) => `${leadingWhitespace}${replacement}${trailingWhitespace}`,
	};
}

function shouldSkipImageTarget(target: string): boolean {
	const normalizedTarget = target.trim().toLowerCase();

	if (normalizedTarget === '' || normalizedTarget.startsWith('#')) {
		return true;
	}

	if (/^file:/i.test(normalizedTarget)) {
		return false;
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedTarget) && !/^[a-z]:[\\/]/i.test(normalizedTarget)) {
		return true;
	}

	return false;
}

function getVaultResourcePath(imagePath: string, app: App): string | null {
	const adapter = app.vault.adapter as FileSystemAdapter;
	const basePath = normalizePath(adapter.getBasePath());
	const normalizedImagePath = normalizePath(imagePath);
	const vaultRelativePath = normalizedImagePath.startsWith(basePath + '/')
		? normalizedImagePath.slice(basePath.length + 1)
		: null;

	return vaultRelativePath ? adapter.getResourcePath(vaultRelativePath) : null;
}

async function resolveLocalImagePath(target: string, sourceFile: TFile, app: App): Promise<string | null> {
	const decodedTarget = decodeImageTarget(target);
	let fileSystemTarget = decodedTarget.split(/[?#]/)[0];

	if (/^file:/i.test(fileSystemTarget)) {
		try {
			fileSystemTarget = fileURLToPath(fileSystemTarget);
		} catch {
			return null;
		}
	}

	const extension = extname(fileSystemTarget).toLowerCase();

	if (!IMAGE_MIME_TYPES[extension]) {
		return null;
	}

	const adapter = app.vault.adapter as FileSystemAdapter;
	const basePath = adapter.getBasePath();
	const sourceFolder = sourceFile.parent?.path || dirname(sourceFile.path);
	const candidates: string[] = [];
	const isFileSystemAbsolutePath = isAbsolute(fileSystemTarget) || /^[a-z]:[\\/]/i.test(fileSystemTarget);

	if (isFileSystemAbsolutePath) {
		candidates.push(fileSystemTarget);
	} else if (!fileSystemTarget.startsWith('/')) {
		candidates.push(join(basePath, sourceFolder, fileSystemTarget));
	}

	const vaultRelativeTarget = normalizePath(fileSystemTarget).replace(/^\/+/, '');
	candidates.push(join(basePath, vaultRelativeTarget));

	const linkedFile = app.metadataCache.getFirstLinkpathDest(fileSystemTarget, sourceFile.path);
	if (linkedFile) {
		candidates.push(join(basePath, linkedFile.path));
	}

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

function decodeImageTarget(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

async function readEmbeddedImage(imagePath: string, settings: MarpSlidesSettings): Promise<EmbeddedImage | null> {
	const extension = extname(imagePath).toLowerCase();
	const mimeType = IMAGE_MIME_TYPES[extension];

	if (!mimeType) {
		return null;
	}

	const buffer = await readFile(imagePath);
	const convertedImage = await maybeConvertToWebP(buffer, mimeType, settings);
	return convertedImage || { buffer, mimeType };
}

async function maybeConvertToWebP(buffer: Buffer, mimeType: string, settings: MarpSlidesSettings): Promise<EmbeddedImage | null> {
	if (!settings.EmbeddedHTMLConvertImagesToWebP || !['image/png', 'image/jpeg'].includes(mimeType)) {
		return null;
	}

	const thresholdBytes = settings.EmbeddedHTMLWebPThresholdKB * 1024;

	if (buffer.length < thresholdBytes) {
		return null;
	}

	const webpBuffer = await convertImageBufferToWebP(buffer, mimeType, settings.EmbeddedHTMLWebPQuality);

	if (!webpBuffer || webpBuffer.length >= buffer.length) {
		return null;
	}

	return {
		buffer: webpBuffer,
		mimeType: 'image/webp',
	};
}

async function convertImageBufferToWebP(buffer: Buffer, mimeType: string, quality: number): Promise<Buffer | null> {
	if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
		return null;
	}

	const blob = new Blob([buffer as unknown as BlobPart], { type: mimeType });
	const objectUrl = URL.createObjectURL(blob);

	try {
		const image = await loadImage(objectUrl);

		if (!image.naturalWidth || !image.naturalHeight) {
			return null;
		}

		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		context.drawImage(image, 0, 0);
		const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));

		if (!webpBlob) {
			return null;
		}

		const arrayBuffer = await webpBlob.arrayBuffer();
		return Buffer.from(arrayBuffer);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Failed to load image'));
		image.src = url;
	});
}
