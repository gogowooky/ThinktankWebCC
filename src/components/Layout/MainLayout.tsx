import React from 'react';
import './MainLayout.css';
import { TTPanel } from '../Panel/TTPanel';
import { Splitter } from './Splitter';
import { TTApplication } from '../../Views/TTApplication';
import { TTModels } from '../../models/TTModels';
import { ModelBrowser } from '../Explorer/ModelBrowser';

export const MainLayout: React.FC = () => {
    // 1. Horizontal Split: Left (Lib/Idx) vs Rest (Center+Right)
    const [leftVsRestRatio, setLeftVsRestRatio] = React.useState(TTApplication.Instance.PanelLayout.LeftVsRest);

    // 2. Horizontal Split (inside Rest): Center (Shelf/Desk/Sys) vs Right (Log/Chat)
    const [centerVsRightRatio, setCenterVsRightRatio] = React.useState(TTApplication.Instance.PanelLayout.CenterVsRight);

    // Left Col: Lib vs Idx
    const [libVsIdxRatio, setLibVsIdxRatio] = React.useState(TTApplication.Instance.PanelLayout.LibVsIdx);

    // Center Col: Shelf vs (Desk+Sys)
    const [shelfVsRestRatio, setShelfVsRestRatio] = React.useState(TTApplication.Instance.PanelLayout.ShelfVsRest);
    // Center Col: Desk vs System (inside Desk+Sys)
    const [deskVsSysRatio, setDeskVsSysRatio] = React.useState(TTApplication.Instance.PanelLayout.DeskVsSys);

    // Right Col: Chat vs Log
    const [chatVsLogRatio, setChatVsLogRatio] = React.useState(TTApplication.Instance.PanelLayout.ChatVsLog);


    const containerRef = React.useRef<HTMLDivElement>(null);
    const restGridRef = React.useRef<HTMLDivElement>(null);
    const leftColRef = React.useRef<HTMLDivElement>(null);
    const centerColRef = React.useRef<HTMLDivElement>(null);
    const centerRestRef = React.useRef<HTMLDivElement>(null); // Desk+Sys container
    const rightColRef = React.useRef<HTMLDivElement>(null);

    // -- Horizontal Resize Handlers --
    const handleLeftVsRestResize = (delta: number) => {
        if (!containerRef.current) return;
        const totalWidth = containerRef.current.offsetWidth;
        const currentWidth = totalWidth * leftVsRestRatio;
        const newWidth = currentWidth + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newWidth / totalWidth));
        setLeftVsRestRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.LeftVsRest = newRatio;
        TTApplication.Instance.PanelLayout = layout; // Trigger notify
    };

    const handleCenterVsRightResize = (delta: number) => {
        if (!restGridRef.current) return;
        const totalWidth = restGridRef.current.offsetWidth;
        const currentWidth = totalWidth * centerVsRightRatio;
        const newWidth = currentWidth + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newWidth / totalWidth));
        setCenterVsRightRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.CenterVsRight = newRatio;
        TTApplication.Instance.PanelLayout = layout;
    };

    // -- Vertical Resize Handlers (Left) --
    const handleLibVsIdxResize = (delta: number) => {
        if (!leftColRef.current) return;
        const totalHeight = leftColRef.current.offsetHeight;
        const currentHeight = totalHeight * libVsIdxRatio;
        const newHeight = currentHeight + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newHeight / totalHeight));
        setLibVsIdxRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.LibVsIdx = newRatio;
        TTApplication.Instance.PanelLayout = layout;
    };

    // -- Vertical Resize Handlers (Center) --
    const handleShelfVsRestResize = (delta: number) => {
        if (!centerColRef.current) return;
        const totalHeight = centerColRef.current.offsetHeight;
        const currentHeight = totalHeight * shelfVsRestRatio;
        const newHeight = currentHeight + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newHeight / totalHeight));
        setShelfVsRestRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.ShelfVsRest = newRatio;
        TTApplication.Instance.PanelLayout = layout;
    };

    const handleDeskVsSysResize = (delta: number) => {
        if (!centerRestRef.current) return;
        const totalHeight = centerRestRef.current.offsetHeight;
        const currentHeight = totalHeight * deskVsSysRatio;
        const newHeight = currentHeight + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newHeight / totalHeight));
        setDeskVsSysRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.DeskVsSys = newRatio;
        TTApplication.Instance.PanelLayout = layout;
    };

    // -- Vertical Resize Handlers (Right) --
    const handleChatVsLogResize = (delta: number) => {
        if (!rightColRef.current) return;
        const totalHeight = rightColRef.current.offsetHeight;
        const currentHeight = totalHeight * chatVsLogRatio;
        const newHeight = currentHeight + delta;
        const newRatio = Math.max(0.0, Math.min(1.0, newHeight / totalHeight));
        setChatVsLogRatio(newRatio);

        // Update App State
        const layout = TTApplication.Instance.PanelLayout;
        layout.ChatVsLog = newRatio;
        TTApplication.Instance.PanelLayout = layout;
    };


    // Active Panel State synced with TTApplication
    const [activePanel, setActivePanel] = React.useState<string>(TTApplication.Instance.ActivePanel?.Name || '');

    React.useEffect(() => {
        const updateState = () => {
            setActivePanel(TTApplication.Instance.ActivePanel?.Name || '');

            // Sync Layout Ratios from App State (for external changes)
            const layout = TTApplication.Instance.PanelLayout;
            setLeftVsRestRatio(layout.LeftVsRest);
            setCenterVsRightRatio(layout.CenterVsRight);
            setLibVsIdxRatio(layout.LibVsIdx);
            setShelfVsRestRatio(layout.ShelfVsRest);
            setDeskVsSysRatio(layout.DeskVsSys);
            setChatVsLogRatio(layout.ChatVsLog);
        };
        TTApplication.Instance.AddOnUpdate('MainLayout', updateState);
        return () => {
            TTApplication.Instance.RemoveOnUpdate('MainLayout');
        };
    }, []);

    const activatePanel = (panelName: string) => {
        const panel = TTApplication.Instance.GetPanel(panelName);
        if (panel) {
            TTApplication.Instance.Focus(panelName, panel.Mode, panel.Tool);
        }
    };

    // Helper to get model
    const getModel = (name: string) => TTApplication.Instance.GetPanel(name)!;

    // Memoize tableChildren to prevent unnecessary re-renders
    const libraryTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance} panel={getModel('Library')} />, []);
    const indexTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Status} panel={getModel('Index')} />, []);
    const shelfTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Events} panel={getModel('Shelf')} />, []);
    const deskTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Memos} panel={getModel('Desk')} />, []);
    const systemTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Actions} panel={getModel('System')} />, []);
    const chatTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Events} panel={getModel('Chat')} />, []);
    const logTable = React.useMemo(() => <ModelBrowser root={TTModels.Instance.Status} panel={getModel('Log')} />, []);

    return (
        <div className="main-layout" ref={containerRef}>
            {/* L1: Left Column (Library/Index) */}
            <div className="layout-col left-panels" ref={leftColRef} style={{ flex: leftVsRestRatio }}>
                <div className="panel-container" style={{ flex: libVsIdxRatio }}>
                    <TTPanel
                        model={getModel('Library')}
                        isActive={activePanel === 'Library'}
                        onActivate={() => activatePanel('Library')}
                        tableChildren={libraryTable}
                    />
                </div>
                <Splitter direction="vertical" onResize={handleLibVsIdxResize} />
                <div className="panel-container" style={{ flex: 1 - libVsIdxRatio }}>
                    <TTPanel
                        model={getModel('Index')}
                        isActive={activePanel === 'Index'}
                        onActivate={() => activatePanel('Index')}
                        tableChildren={indexTable}
                    />
                </div>
            </div>

            <Splitter direction="horizontal" onResize={handleLeftVsRestResize} />

            {/* L1: Rest (Center + Right) */}
            <div className="layout-col rest-panels" ref={restGridRef} style={{ flex: 1 - leftVsRestRatio, display: 'flex', flexDirection: 'row' }}>

                {/* L2: Center Column (Shelf/Desk/System) */}
                <div className="layout-col center-panels" ref={centerColRef} style={{ flex: centerVsRightRatio }}>
                    <div className="panel-container" style={{ flex: shelfVsRestRatio }}>
                        <TTPanel
                            model={getModel('Shelf')}
                            isActive={activePanel === 'Shelf'}
                            onActivate={() => activatePanel('Shelf')}
                            tableChildren={shelfTable}
                        />
                    </div>
                    <Splitter direction="vertical" onResize={handleShelfVsRestResize} />

                    <div className="panel-container" ref={centerRestRef} style={{ flex: 1 - shelfVsRestRatio, display: 'flex', flexDirection: 'column' }}>
                        <div className="panel-container" style={{ flex: deskVsSysRatio }}>
                            <TTPanel
                                model={getModel('Desk')}
                                isActive={activePanel === 'Desk'}
                                onActivate={() => activatePanel('Desk')}
                                tableChildren={deskTable}
                            />
                        </div>
                        <Splitter direction="vertical" onResize={handleDeskVsSysResize} />
                        <div className="panel-container" style={{ flex: 1 - deskVsSysRatio }}>
                            <TTPanel
                                model={getModel('System')}
                                isActive={activePanel === 'System'}
                                onActivate={() => activatePanel('System')}
                                tableChildren={systemTable}
                            />
                        </div>
                    </div>
                </div>

                <Splitter direction="horizontal" onResize={handleCenterVsRightResize} />

                {/* L2: Right Column (Chat/Log) */}
                <div className="layout-col right-panels" ref={rightColRef} style={{ flex: 1 - centerVsRightRatio }}>
                    <div className="panel-container" style={{ flex: chatVsLogRatio }}>
                        <TTPanel
                            model={getModel('Chat')}
                            isActive={activePanel === 'Chat'}
                            onActivate={() => activatePanel('Chat')}
                            tableChildren={chatTable}
                        />
                    </div>
                    <Splitter direction="vertical" onResize={handleChatVsLogResize} />
                    <div className="panel-container" style={{ flex: 1 - chatVsLogRatio }}>
                        <TTPanel
                            model={getModel('Log')}
                            isActive={activePanel === 'Log'}
                            onActivate={() => activatePanel('Log')}
                            tableChildren={logTable}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};
