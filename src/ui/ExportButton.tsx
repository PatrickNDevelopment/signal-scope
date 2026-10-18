/** An export button that, for data labelled "restricted", needs an explicit opt-in (docs/spec/00). */
import { useState } from 'react';

export function ExportButton(props: {
  label: string;
  restricted: boolean;
  disabled?: boolean;
  onExport: () => void;
}) {
  const [include, setInclude] = useState(false);
  const blocked = props.restricted && !include;
  return (
    <span className="inline-group export">
      {props.restricted ? (
        <label className="check small">
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
          Include restricted data
        </label>
      ) : null}
      <button
        type="button"
        disabled={props.disabled === true || blocked}
        title={
          blocked ? 'This export contains data labelled restricted; tick the box first.' : undefined
        }
        onClick={props.onExport}
      >
        {props.label}
      </button>
    </span>
  );
}
