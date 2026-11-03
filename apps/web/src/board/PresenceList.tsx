import type { Ink } from '@chalkline/core';
import { CheckIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { PRESENCE_COLORS, initials, saveIdentity } from '../app/identity.ts';
import type { Editor } from '../editor/editor.ts';
import type { Identity } from '../editor/presence.ts';
import { useStore } from '../lib/store.ts';
import { INK_LABELS, PALETTES } from '../theme/palette.ts';
import { Popover } from '../ui/Popover.tsx';

const SHOWN = 4;

interface Props {
  editor: Editor;
  identity: Identity;
  onIdentityChange: (identity: Identity) => void;
}

/** Who is here. Click someone to jump to their cursor; click yourself to change your name and color. */
export function PresenceList({ editor, identity, onIdentityChange }: Props) {
  const peers = useStore(editor.presence.peers, (s) => s.list);
  const theme = useStore(editor.store, (s) => s.theme);
  const palette = PALETTES[theme];
  const shown = peers.slice(0, SHOWN);
  const hidden = peers.length - shown.length;

  return (
    <div className="presence" role="group" aria-label={`${peers.length + 1} on this board`}>
      <Popover
        label="Your name and color"
        trigger={(props) => (
          <button
            {...props}
            type="button"
            className="avatar is-self"
            style={{ ['--peer' as string]: palette.ink[identity.color] }}
            aria-label={`You (${identity.name}). Change name or color`}
            data-tip={`You · ${identity.name}`}
            data-tip-side="bottom"
          >
            {initials(identity.name)}
          </button>
        )}
      >
        {(close) => (
          <IdentityForm
            identity={identity}
            colors={palette.ink}
            onSave={(next) => {
              onIdentityChange(next);
              saveIdentity(next);
              close();
            }}
          />
        )}
      </Popover>
      {shown.map((peer) => (
        <button
          key={peer.clientId}
          type="button"
          className="avatar"
          style={{ ['--peer' as string]: palette.ink[peer.color] }}
          aria-label={peer.cursor ? `${peer.name}. Jump to their cursor` : peer.name}
          data-tip={peer.cursor ? `${peer.name} · jump to cursor` : peer.name}
          data-tip-side="bottom"
          data-testid="peer-avatar"
          disabled={!peer.cursor}
          onClick={() => editor.jumpTo(peer)}
        >
          {initials(peer.name)}
        </button>
      ))}
      {hidden > 0 && (
        <span
          className="avatar is-more"
          data-tip={peers
            .slice(SHOWN)
            .map((p) => p.name)
            .join(', ')}
          data-tip-side="bottom"
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

interface FormProps {
  identity: Identity;
  colors: Record<Ink, string>;
  onSave: (identity: Identity) => void;
}

function IdentityForm({ identity, colors, onSave }: FormProps) {
  const [name, setName] = useState(identity.name);
  const [color, setColor] = useState(identity.color);
  return (
    <form
      className="identity-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name: name.trim().slice(0, 32) || identity.name, color });
      }}
    >
      <label className="field-label" htmlFor="identity-name">
        Your name on boards
      </label>
      <input
        id="identity-name"
        className="text-input"
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        autoComplete="nickname"
        data-autofocus
      />
      <fieldset className="color-choices">
        <legend className="field-label">Cursor color</legend>
        {PRESENCE_COLORS.map((ink) => (
          <label key={ink} className="color-choice" style={{ ['--peer' as string]: colors[ink] }}>
            <input
              type="radio"
              name="identity-color"
              value={ink}
              checked={color === ink}
              onChange={() => setColor(ink)}
            />
            <span className="color-dot" aria-hidden="true">
              {color === ink && <CheckIcon size={14} weight="bold" />}
            </span>
            <span className="visually-hidden">{INK_LABELS[ink]}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn btn-primary btn-small">
        Save
      </button>
    </form>
  );
}
