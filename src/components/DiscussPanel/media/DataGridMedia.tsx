import { useRef, forwardRef, useImperativeHandle } from 'react';
import type { MediaProps } from './types';
import { TableGridView } from './datagrid/TableGridView';
import { ThinkListMedia } from './datagrid/ThinkListMedia';
import './DataGridMedia.css';

export interface DataGridMediaRef { focus: () => void; }

export const DataGridMedia = forwardRef<DataGridMediaRef, MediaProps>(function DataGridMedia(props, ref) {
  const datagridRootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const input = datagridRootRef.current?.querySelector<HTMLInputElement>(
        '.table-grid__filter, .datagrid-media__filter'
      );
      input?.focus();
    },
  }));

  if (props.think?.ContentType === 'table') {
    return (
      <div ref={datagridRootRef} style={{ display: 'contents' }}>
        <TableGridView
          think={props.think}
          onSave={props.onSave}
          onDirtyChange={props.onDirtyChange}
          editorSettings={props.editorSettings}
        />
      </div>
    );
  }
  return (
    <div ref={datagridRootRef} style={{ display: 'contents' }}>
      <ThinkListMedia {...props} />
    </div>
  );
});
