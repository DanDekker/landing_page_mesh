import { type FieldSettings, type Form, type Palette } from '../shared/field.ts';

export class MeshControls extends HTMLElement {
  private lifetime?: AbortController;

  connectedCallback() {
    this.lifetime = new AbortController();
    const { signal } = this.lifetime;
    this.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.form) this.change({ form: button.dataset.form as Form });
      if (button.dataset.palette) this.change({ palette: button.dataset.palette as Palette });
      if (button.dataset.action === 'settings') this.toggleSettings();
      else if (button.dataset.action) this.dispatchEvent(new CustomEvent('mesh-action', { detail: button.dataset.action, bubbles: true }));
    }, { signal });
    this.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.setting) this.change({ [input.dataset.setting]: Number(input.value) / 100 });
    }, { signal });
    document.addEventListener('pointerdown', event => { if (!this.contains(event.target as Node)) this.toggleSettings(false); }, { signal });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.toggleSettings(false); }, { signal });
  }

  disconnectedCallback() { this.lifetime?.abort(); }

  private change(settings: Partial<FieldSettings>) { this.dispatchEvent(new CustomEvent('mesh-settings', { detail: settings, bubbles: true })); }

  private toggleSettings(open?: boolean) {
    const panel = this.querySelector<HTMLElement>('.settings-panel')!;
    const expanded = open ?? panel.hidden;
    panel.hidden = !expanded;
    this.querySelector('[aria-controls="field-settings"]')?.setAttribute('aria-expanded', String(expanded));
    if (!expanded && panel.contains(document.activeElement)) this.querySelector<HTMLButtonElement>('[aria-controls="field-settings"]')?.focus();
  }

  reflect(settings: FieldSettings) {
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-form]')) {
      const active = button.dataset.form === settings.form; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-palette]')) {
      const active = button.dataset.palette === settings.palette; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    for (const name of ['turbulence', 'tension'] as const) {
      const value = String(Math.round(settings[name] * 100));
      const input = this.querySelector<HTMLInputElement>(`[data-setting="${name}"]`); if (input) input.value = value;
      const output = this.querySelector<HTMLOutputElement>(`[data-output="${name}"]`); if (output) output.value = `${value}%`;
    }
    const pause = this.querySelector('[data-action="pause"]');
    pause?.setAttribute('aria-pressed', String(settings.paused));
    pause?.setAttribute('aria-label', settings.paused ? 'Resume motion' : 'Pause motion');
    pause?.setAttribute('title', `${settings.paused ? 'Resume' : 'Pause'} · Space`);
  }
}
