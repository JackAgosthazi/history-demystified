import type { EntityType } from './core/types';

/**
 * The topics the demo ships pre-generated.
 *
 * Two per supported type so a reviewer can see each treatment without
 * spending anything, plus the drill-down targets from those pages so that
 * following a chip out of an example also lands on cached content.
 */
export interface ExampleTopic {
  query: string;
  type: EntityType;
  blurb: string;
}

export const EXAMPLES: ExampleTopic[] = [
  { query: 'Napoleon', type: 'person', blurb: 'Artillery officer to emperor, and the wreck of it' },
  { query: 'Cleopatra', type: 'person', blurb: 'The last pharaoh, and who got to write her down' },
  { query: "Hundred Years' War", type: 'conflict', blurb: 'A succession dispute that outlived everyone who started it' },
  { query: 'Battle of Waterloo', type: 'conflict', blurb: 'One June afternoon that closed a quarter-century of war' },
  { query: 'Assassination of Archduke Franz Ferdinand', type: 'event', blurb: 'A wrong turn in Sarajevo, and the month that followed' },
  { query: 'Cuban Missile Crisis', type: 'event', blurb: 'Thirteen days at the closest approach to nuclear war' },
  { query: 'Renaissance', type: 'period', blurb: 'A label invented later for a change people lived through' },
  { query: 'Meiji Restoration', type: 'period', blurb: 'A country that rebuilt itself in a generation' },
];

/** Additional subjects pre-generated so drill-downs stay free. */
export const DRILLDOWN_WARMUP = [
  'Duke of Wellington',
  'Edward III of England',
  'French Revolution',
  'Joan of Arc',
];

export const TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person',
  conflict: 'Conflict',
  event: 'Event',
  period: 'Period',
};
