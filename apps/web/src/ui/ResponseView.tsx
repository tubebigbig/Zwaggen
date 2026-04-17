import * as Tooltip from '@radix-ui/react-tooltip';
import type { ValidationError } from '../validator/validate';

interface Props { body: unknown; errors: ValidationError[] }

export function ResponseView({ body, errors }: Props) {
  const byPath = new Map<string, string>();
  for (const e of errors) byPath.set(e.path, e.message);

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="font-mono text-xs whitespace-pre">
        {renderNode(body, '', byPath)}
      </div>
      {errors.length > 0 && (
        <ul role="list" className="mt-3 border-t pt-2 text-xs">
          {errors.map((e, i) => (
            <li key={i} className="text-red-700"><code>{e.path || '/'}</code>: {e.message}</li>
          ))}
        </ul>
      )}
    </Tooltip.Provider>
  );
}

function renderNode(v: unknown, path: string, errs: Map<string, string>, indent = 0): JSX.Element {
  const pad = '  '.repeat(indent);
  const key = path;
  const err = errs.get(key);

  const wrap = (el: JSX.Element): JSX.Element => err
    ? (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            data-error={key || '/'}
            className="underline decoration-red-500 decoration-wavy underline-offset-2"
          >{el}</span>
        </Tooltip.Trigger>
        <Tooltip.Content className="rounded bg-red-700 px-2 py-1 text-white">{err}</Tooltip.Content>
      </Tooltip.Root>
    )
    : el;

  if (v === null) return wrap(<span>null</span>);
  if (typeof v !== 'object') return wrap(<span>{JSON.stringify(v)}</span>);
  if (Array.isArray(v)) {
    return (
      <span>[{v.length === 0 ? ']' : '\n'}
        {v.map((item, i) => (
          <span key={i}>{pad}  {renderNode(item, `${path}[${i}]`, errs, indent + 1)}{i < v.length - 1 ? ',' : ''}{'\n'}</span>
        ))}
        {v.length > 0 && <span>{pad}]</span>}
      </span>
    );
  }
  const entries = Object.entries(v as Record<string, unknown>);
  return (
    <span>{'{'}{entries.length === 0 ? '}' : '\n'}
      {entries.map(([k, val], i) => {
        const childPath = path ? `${path}.${k}` : k;
        return (
          <span key={k}>{pad}  <span>{JSON.stringify(k)}</span>: {renderNode(val, childPath, errs, indent + 1)}{i < entries.length - 1 ? ',' : ''}{'\n'}</span>
        );
      })}
      {entries.length > 0 && <span>{pad}{'}'}</span>}
    </span>
  );
}
