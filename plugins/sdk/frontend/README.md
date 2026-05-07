# `@openmail/plugin-sdk`

Pacote frontend local do Open Mail para desenvolvimento de plugins React.

## O que ele expõe

- `defineFrontendPlugin(...)`
- Tipos de `FrontendPlugin`, `FrontendPluginContext`, `FrontendPluginManifest`
- Tipos de hooks, commands e config fields

## Uso mínimo

```tsx
import { defineFrontendPlugin } from '@openmail/plugin-sdk';

const StatusBadge = () => <span>Plugin ready</span>;

export default defineFrontendPlugin({
  components: {
    StatusBadge
  }
});
```

## Escopo atual

- Registro de componentes por slot
- Hooks frontend
- Commands frontend
- Config schema-driven

## Próximo passo típico

Combine este pacote com o template em [plugins/template/README.md](/Users/leco/RustroverProjects/open-mail/plugins/template/README.md).
