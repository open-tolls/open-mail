import { Component, Fragment, Suspense, useSyncExternalStore, type ReactNode } from 'react';
import { pluginManager } from './plugin-manager';

type PluginSlotProps = {
  name: string;
  props?: Record<string, unknown>;
};

class PluginErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export const PluginSlot = ({ name, props }: PluginSlotProps) => {
  const slotKey = useSyncExternalStore(pluginManager.subscribe, () => pluginManager.getRevision(), () => 0);
  const components = pluginManager.getSlotComponents(name);

  return (
    <>
      {components.map((ComponentType, index) => (
        <PluginErrorBoundary key={`${name}-${slotKey}-${index}`}>
          <Suspense fallback={null}>
            <Fragment>
              <ComponentType {...props} />
            </Fragment>
          </Suspense>
        </PluginErrorBoundary>
      ))}
    </>
  );
};
