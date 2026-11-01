import React, { useEffect, useState } from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import {
  ACTION_FIELD_TYPES,
  ACTION_TYPES,
  ACTION_TYPE_DEFINITIONS,
  applyActionType,
  formatJsonField,
  formatListField,
  getActionFields,
  getActionTypeLabel,
  parseJsonField,
  parseListField,
  validateActionConfig,
} from '../../utils/workflowNodeConfig';

const { FiX, FiTrash2, FiSliders, FiAlertTriangle, FiCheckCircle } = FiIcons;

/**
 * Inspector for a single node on the workflow canvas.
 *
 * Reads its field layout from `utils/workflowNodeConfig` rather than
 * hand-coding a form per action type, so adding an action type to the edge
 * runner is a one-place change. Validation is the same function the
 * pre-dispatch gate uses, so what shows here as an error is exactly what would
 * stop a run.
 *
 * Props:
 *   node     — React Flow node (or null when nothing is selected)
 *   onChange — (nodeId, dataPatch) => void; patch is merged into `node.data`
 *   onDelete — (nodeId) => void, optional
 *   onClose  — () => void
 */
const WorkflowNodeInspector = ({ node, onChange = () => {}, onDelete, onClose }) => {
  if (!node) return null;

  const data = node.data && typeof node.data === 'object' ? node.data : {};
  const config = data.config && typeof data.config === 'object' ? data.config : {};
  const isAction = node.type === 'action';
  const actionType = data.actionType;
  const { valid, errors } = isAction
    ? validateActionConfig(actionType, config)
    : { valid: true, errors: {} };

  const patchData = (patch) => onChange(node.id, patch);

  const updateConfigValue = (key, value) => {
    const nextConfig = { ...config };
    if (value === undefined || value === null || value === '') {
      delete nextConfig[key];
    } else {
      nextConfig[key] = value;
    }
    patchData({ config: nextConfig });
  };

  return (
    <aside
      aria-label="Node configuration"
      className="w-full lg:w-80 shrink-0 glass-effect border border-cyan-500/30 rounded-lg p-4 space-y-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center">
            <SafeIcon icon={FiSliders} className="mr-2 text-cyan-400" size={14} />
            Node Configuration
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            <span className="font-mono">{node.type}</span> · <span className="font-mono">{node.id}</span>
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close node configuration"
            className="text-slate-400 hover:text-white p-1"
          >
            <SafeIcon icon={FiX} size={16} />
          </button>
        )}
      </div>

      <div>
        <label htmlFor={`node-label-${node.id}`} className="block text-xs text-slate-400 mb-1">
          Step Name
        </label>
        <input
          id={`node-label-${node.id}`}
          type="text"
          value={data.label ?? ''}
          onChange={(event) => patchData({ label: event.target.value })}
          placeholder="Describe this step"
          className="w-full glass-effect border border-cyan-500/30 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
        />
      </div>

      {!isAction && (
        <p className="text-xs text-slate-400 leading-relaxed">
          {node.type === 'trigger'
            ? 'Trigger nodes start the run. They take their payload from the dispatch context, so they carry no action configuration.'
            : 'Condition nodes are evaluated inline by the runner; the branches are the labelled edges leaving this node.'}
        </p>
      )}

      {isAction && (
        <>
          <div>
            <label htmlFor={`node-action-type-${node.id}`} className="block text-xs text-slate-400 mb-1">
              Action Type
            </label>
            <select
              id={`node-action-type-${node.id}`}
              value={actionType ?? ''}
              onChange={(event) => {
                const nextType = event.target.value;
                if (!nextType) {
                  patchData({ actionType: undefined, config: {} });
                  return;
                }
                const nextData = applyActionType(data, nextType);
                patchData({ actionType: nextData.actionType, config: nextData.config, label: nextData.label });
              }}
              className="w-full glass-effect border border-cyan-500/30 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="">— select an action —</option>
              {ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTION_TYPE_DEFINITIONS[type].label}
                </option>
              ))}
            </select>
            {actionType && ACTION_TYPE_DEFINITIONS[actionType] && (
              <p className="text-xs text-slate-500 mt-1">{ACTION_TYPE_DEFINITIONS[actionType].summary}</p>
            )}
            {errors._type && (
              <p className="text-xs text-amber-400 mt-1 flex items-center">
                <SafeIcon icon={FiAlertTriangle} className="mr-1" size={12} />
                {errors._type}
              </p>
            )}
          </div>

          {getActionFields(actionType).map((field) => (
            <ConfigField
              key={field.key}
              nodeId={node.id}
              field={field}
              value={config[field.key]}
              error={errors[field.key]}
              onChange={(value) => updateConfigValue(field.key, value)}
            />
          ))}

          {actionType && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded p-2 text-xs border ${
                valid
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              }`}
            >
              <SafeIcon icon={valid ? FiCheckCircle : FiAlertTriangle} size={12} className="mt-0.5" />
              <span>
                {valid
                  ? `Ready to run as ${getActionTypeLabel(actionType)}.`
                  : 'The runner halts the DAG on this node until every field above is valid.'}
              </span>
            </div>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="w-full flex items-center justify-center px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded text-sm transition-colors"
            >
              <SafeIcon icon={FiTrash2} className="mr-2" size={14} />
              Delete Step
            </button>
          )}
        </>
      )}
    </aside>
  );
};

const fieldClasses =
  'w-full glass-effect border border-cyan-500/30 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none';

const ConfigField = ({ nodeId, field, value, error, onChange }) => {
  const inputId = `node-${nodeId}-${field.key}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  const label = (
    <label htmlFor={inputId} className="block text-xs text-slate-400 mb-1">
      {field.label}
      {field.required && <span className="text-cyan-400 ml-1" aria-hidden="true">*</span>}
    </label>
  );

  const footer = (
    <>
      {field.help && (
        <p id={helpId} className="text-xs text-slate-500 mt-1">
          {field.help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-amber-400 mt-1">
          {error}
        </p>
      )}
    </>
  );

  if (field.type === ACTION_FIELD_TYPES.SELECT) {
    return (
      <div>
        {label}
        <select
          id={inputId}
          value={value ?? ''}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClasses}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {footer}
      </div>
    );
  }

  if (field.type === ACTION_FIELD_TYPES.JSON) {
    return (
      <div>
        {label}
        <JsonConfigField
          inputId={inputId}
          value={value}
          placeholder={field.placeholder}
          describedBy={describedBy}
          invalid={Boolean(error)}
          onChange={onChange}
        />
        {footer}
      </div>
    );
  }

  if (field.type === ACTION_FIELD_TYPES.TEXTAREA) {
    return (
      <div>
        {label}
        <textarea
          id={inputId}
          rows={3}
          value={value ?? ''}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClasses}
        />
        {footer}
      </div>
    );
  }

  if (field.type === ACTION_FIELD_TYPES.NUMBER) {
    return (
      <div>
        {label}
        <input
          id={inputId}
          type="number"
          value={value ?? ''}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === '' ? undefined : Number(raw));
          }}
          className={fieldClasses}
        />
        {footer}
      </div>
    );
  }

  if (field.type === ACTION_FIELD_TYPES.LIST) {
    return (
      <div>
        {label}
        <input
          id={inputId}
          type="text"
          value={formatListField(value)}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => {
            const entries = parseListField(event.target.value);
            if (entries.length === 0) {
              onChange(undefined);
            } else if (entries.length === 1) {
              // The runner accepts a bare string for `to`; a one-element array
              // would still work but stores noise in the definition.
              onChange(field.splitMultiple ? entries : entries[0]);
            } else {
              onChange(entries);
            }
          }}
          className={fieldClasses}
        />
        {footer}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        id={inputId}
        type="text"
        value={value ?? ''}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClasses}
      />
      {footer}
    </div>
  );
};

/**
 * JSON editor.
 *
 * A definition field holds a parsed value, but half-typed JSON is not valid
 * JSON — so the text is buffered locally, the parsed value is committed on a
 * successful parse, and a syntax error is shown in place instead of writing a
 * broken value into the definition. The buffer resets when the inspector
 * switches to a different field or node.
 */
const JsonConfigField = ({ inputId, value, placeholder, describedBy, invalid, onChange }) => {
  const [text, setText] = useState(() => formatJsonField(value));
  const [syntaxError, setSyntaxError] = useState(null);

  useEffect(() => {
    setText(formatJsonField(value));
    setSyntaxError(null);
  }, [inputId]);

  return (
    <>
      <textarea
        id={inputId}
        rows={4}
        value={text}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid || syntaxError ? 'true' : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const parsed = parseJsonField(next);
          if (parsed.ok) {
            setSyntaxError(null);
            onChange(parsed.value);
          } else {
            setSyntaxError(parsed.error);
          }
        }}
        className={`${fieldClasses} font-mono text-xs`}
      />
      {syntaxError && <p className="text-xs text-amber-400 mt-1">Invalid JSON: {syntaxError}</p>}
    </>
  );
};

export default WorkflowNodeInspector;
