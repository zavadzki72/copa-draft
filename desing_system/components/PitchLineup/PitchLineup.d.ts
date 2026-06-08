import * as React from 'react';

/** A single player marker on the pitch. */
export interface PitchPlayer {
  /** Shirt number shown inside the marker. */
  num: number;
  /** Player name shown beneath the marker. */
  name: string;
  /** Short position code revealed on hover (e.g. "ZAG", "MC", "CA"). */
  pos: string;
  /** Horizontal position, 0–100 (left→right across the pitch). */
  x: number;
  /** Vertical position, 0–100 (top = attack, bottom = own goal). */
  y: number;
  /** Marks the goalkeeper — rendered in yellow instead of green. */
  gk?: boolean;
}

export interface PitchLineupProps {
  /**
   * Tactical formation to display. Ignored when `players` is supplied.
   * @default "4-3-3"
   */
  formation?: '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2';
  /**
   * Pitch orientation. Vertical is portrait (attack points up); horizontal
   * is landscape (own goal left, attack right).
   * @default "vertical"
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Team name shown in the header beside the `:escalação` token.
   * @default "Brasil"
   */
  teamName?: string;
  /**
   * Override the built-in Seleção lineup with a custom set of players.
   * When provided, the formation switcher is hidden.
   */
  players?: PitchPlayer[];
  /**
   * Show each player's name beneath their marker.
   * @default true
   */
  showNames?: boolean;
  /**
   * Enable the formation switcher (only shown when `players` is not set).
   * @default true
   */
  interactive?: boolean;
  /** Width of the component (number → px). Defaults to 360 vertical / 560 horizontal. */
  width?: number | string;
}

/**
 * Top-down football pitch with a lineup of players arranged in a tactical
 * formation. Dark green-tinted grass to match the system; green player
 * markers, yellow goalkeeper, hover reveals the position label. Ships with
 * the Seleção Brasileira titular lineup across four formations.
 */
export function PitchLineup(props: PitchLineupProps): JSX.Element;
