import { MeshApp } from './components/app.ts';
import { MeshControls } from './components/controls.ts';
import { ParticleField } from './components/particle-field.ts';

customElements.define('mesh-app', MeshApp);
customElements.define('mesh-controls', MeshControls);
customElements.define('particle-field', ParticleField);
