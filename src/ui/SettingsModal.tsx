import { useEffect, useState } from 'react';
import { bus } from '../actions/bus';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  buttonLabel,
  getProfile,
  getRebindTarget,
  resetProfile,
  setRebindTarget,
  subscribeProfile,
} from '../controllers/profile';
import { useAppStore } from '../state/store';

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const [, force] = useState(0);

  useEffect(() => subscribeProfile(() => force((value) => value + 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useAppStore.getState().toggleSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const profile = getProfile();
  const rebind = getRebindTarget();

  return (
    <div className="modal-overlay" onClick={() => useAppStore.getState().toggleSettings()}>
      <section
        className="modal"
        role="dialog"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="card-title">SETTINGS</div>
          <button className="btn-ghost" onClick={() => useAppStore.getState().toggleSettings()}>
            CLOSE ✕
          </button>
        </div>
        <div className="modal-cols">
          <div className="modal-col">
            <div className="modal-sub">CONTROLLER PROFILE · {profile.name}</div>
            <div className="profile-list">
              {ACTION_ORDER.map((action) => (
                <div className="profile-row" key={action}>
                  <span className="profile-label">{ACTION_LABELS[action]}</span>
                  <span className="profile-btn">{buttonLabel(profile.buttons[action])}</span>
                  <button
                    className={`btn-ghost${rebind === action ? ' armed' : ''}`}
                    onClick={() => setRebindTarget(rebind === action ? null : action)}
                  >
                    {rebind === action ? 'PRESS…' : 'REBIND'}
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={resetProfile}>
                RESET DEFAULTS
              </button>
              {rebind && (
                <span className="card-note">
                  Press a controller button to bind “{ACTION_LABELS[rebind]}”
                </span>
              )}
            </div>
            <div className="card-note">
              Analog controls (L2/R2 faders, sticks) are fixed · profile persists locally
            </div>
          </div>
          <div className="modal-col">
            <div className="modal-sub">FEEDBACK</div>
            <button
              className={`toggle-row${settings.haptics ? ' on' : ''}`}
              onClick={() => setSettings({ haptics: !settings.haptics })}
            >
              <span>Rumble + adaptive triggers</span>
              <span className="toggle-state">{settings.haptics ? 'ON' : 'OFF'}</span>
            </button>
            <button
              className={`toggle-row${settings.lightbar ? ' on' : ''}`}
              onClick={() => setSettings({ lightbar: !settings.lightbar })}
            >
              <span>Lightbar + player LEDs</span>
              <span className="toggle-state">{settings.lightbar ? 'ON' : 'OFF'}</span>
            </button>
            <div className="modal-sub">SAFETY</div>
            <button className="btn-danger" onClick={() => bus.emit('panic', {})}>
              PANIC — FADE OUT MASTER
            </button>
            <div className="card-note">Panic also on the controller (default: PS button)</div>
          </div>
        </div>
      </section>
    </div>
  );
}
