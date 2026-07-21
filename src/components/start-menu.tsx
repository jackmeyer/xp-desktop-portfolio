import { InternalLinkArea } from './internal-link-area';

// popover: top layer + click-outside/Esc dismissal, no JS needed
export function StartMenu({
  name,
  photo,
  html,
  fontSize,
}: {
  name: string;
  photo: string;
  html: string;
  fontSize: number;
}) {
  return (
    <div id="start-menu" className="start-menu" popover="auto">
      <header>
        <img src={photo} alt="" width="56" height="56" />
        <span>{name}</span>
      </header>
      <InternalLinkArea className="start-menu-body" html={html} style={{ fontSize }} />
      <footer>
        <button popoverTarget="start-menu" popoverTargetAction="hide">
          <img src="/icons/power.png" alt="" width="24" height="24" /> Turn Off Computer
        </button>
      </footer>
    </div>
  );
}
