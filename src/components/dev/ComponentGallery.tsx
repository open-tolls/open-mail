import { Archive, MoreHorizontal, Search, Send, Star } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ContextMenu,
  Dropdown,
  IconButton,
  Input,
  Kbd,
  ScrollArea,
  Separator,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Tooltip
} from '@components/ui';
import { builtInThemes } from '@lib/themes';
import { useUIStore } from '@stores/useUIStore';

const samples = ['Inbox density', 'Composer actions', 'Offline states', 'Keyboard rhythm'];

export const ComponentGallery = () => {
  const themeId = useUIStore((state) => state.themeId);
  const cycleTheme = useUIStore((state) => state.cycleTheme);

  return (
    <main className="dev-gallery">
      <section className="dev-gallery-hero">
        <div>
          <p className="eyebrow">Phase 3 component lab</p>
          <h1>Open Mail UI primitives</h1>
          <p>
            A compact route for checking the base controls in isolation before they spread through
            the desktop shell.
          </p>
        </div>
        <div className="dev-gallery-actions">
          <StatusBadge label={`Theme: ${themeId}`} tone="accent" />
          <Button onClick={cycleTheme} variant="primary">
            Cycle theme
          </Button>
        </div>
      </section>

      <section className="dev-gallery-grid" aria-label="Component gallery">
        <article className="dev-card">
          <h2>Controls</h2>
          <div className="dev-stack">
            <div className="dev-row">
              <Button variant="primary">New message</Button>
              <Button>Archive</Button>
              <Button variant="ghost">Snooze</Button>
              <Button variant="danger">Delete</Button>
            </div>
            <div className="dev-row">
              <IconButton icon={<Archive size={16} />} label="Archive selected" />
              <IconButton icon={<Star size={16} />} label="Star selected" />
              <Tooltip content="Send queued mail">
                <IconButton icon={<Send size={16} />} label="Send queued mail" />
              </Tooltip>
            </div>
            <Input hint="Try the focus ring and label spacing." label="Search preview" name="dev-search" />
            <Switch label="Compact density" />
          </div>
        </article>

        <article className="dev-card">
          <h2>Feedback</h2>
          <div className="dev-stack">
            <div className="dev-row">
              <Badge tone="accent">Beta</Badge>
              <Badge tone="success">Synced</Badge>
              <Badge tone="danger">Offline</Badge>
              <Badge>Neutral</Badge>
            </div>
            <div className="dev-row">
              <StatusBadge label="Connected" tone="success" />
              <StatusBadge label="Drafts pending" tone="neutral" />
            </div>
            <div className="dev-loading-row">
              <Spinner />
              <Skeleton className="dev-skeleton-wide" />
            </div>
            <div className="dev-row">
              <Kbd>Cmd</Kbd>
              <Kbd>K</Kbd>
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
            </div>
          </div>
        </article>

        <article className="dev-card">
          <h2>Navigation Surfaces</h2>
          <div className="dev-stack">
            <Dropdown trigger={<span>Mailbox actions</span>}>
              <Button size="sm" variant="ghost">
                Mark all as read
              </Button>
              <Button size="sm" variant="ghost">
                Create folder
              </Button>
            </Dropdown>
            <ContextMenu aria-label="Thread context menu">
              <Button size="sm" variant="ghost">
                Reply
              </Button>
              <Button size="sm" variant="ghost">
                Forward
              </Button>
              <Button size="sm" variant="danger">
                Move to trash
              </Button>
            </ContextMenu>
            <Separator />
            <ScrollArea className="dev-scroll-area">
              {samples.map((sample) => (
                <div className="dev-sample-row" key={sample}>
                  <Search size={14} />
                  <span>{sample}</span>
                  <MoreHorizontal size={14} />
                </div>
              ))}
            </ScrollArea>
          </div>
        </article>

        <article className="dev-card">
          <h2>Identity</h2>
          <div className="dev-stack">
            <div className="dev-row">
              <Avatar name="Open Mail" />
              <Avatar name="Leco Workspace" />
              <Avatar name="Design Systems" />
            </div>
            <p className="dev-note">
              Built-in themes: System, {Object.values(builtInThemes).map((theme) => theme.name).join(', ')}.
            </p>
            <p className="dev-note">
              This route intentionally avoids mailbox data, so visual regressions are easier to spot.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
};
