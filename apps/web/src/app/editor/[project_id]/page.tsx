"use client";

import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { LayersPanel } from "@/components/editor/panels/layers";
import { PreviewPanel } from "@/components/editor/canvas/preview-panel";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/editor/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MobileGate } from "@/components/editor/mobile-gate";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { usePanelStore } from "@/editor/panel-store";
import { useEditorStore } from "@/editor/store";
import { FreeformSidebar } from "@/components/editor/panels/freeform-sidebar";

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<LayoutForMode />
					</div>
					<Onboarding />
					<ChangelogNotification />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function LayoutForMode() {
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	return freeform ? <FreeformLayout /> : <EditorLayout />;
}

/** Figma-style: layers/assets on the left, canvas, design + export on the right. */
function FreeformLayout() {
	const { panels, setPanel } = usePanelStore();
	return (
		<ResizablePanelGroup
			direction="horizontal"
			className="size-full gap-[0.19rem] px-3 pb-3"
			onLayout={(sizes) => {
				setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
				setPanel({ panel: "properties", size: sizes[2] ?? panels.properties });
			}}
		>
			<ResizablePanel defaultSize={panels.tools} minSize={15} maxSize={40} className="min-w-0">
				<FreeformSidebar />
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={100 - panels.tools - panels.properties} minSize={30} className="min-h-0 min-w-0 flex-1">
				<PreviewPanel />
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={panels.properties} minSize={15} maxSize={40} className="min-w-0">
				<PropertiesPanel />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function EditorLayout() {
	const { panels, setPanel } = usePanelStore();

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel({ panel: "mainContent", size: sizes[0] ?? panels.mainContent });
				setPanel({ panel: "layers", size: sizes[1] ?? panels.layers });
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={40}
				maxSize={88}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
						setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
						setPanel({ panel: "properties", size: sizes[2] ?? panels.properties });
					}}
				>
					<ResizablePanel
						defaultSize={panels.tools}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.properties}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<PropertiesPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.layers}
				minSize={12}
				maxSize={60}
				className="min-h-0 px-3 pb-3"
			>
				<LayersPanel />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
