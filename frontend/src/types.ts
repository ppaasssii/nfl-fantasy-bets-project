// src/types.ts

// Dies ist jetzt unser universeller Typ für eine einzelne Wettoption.
export interface BetOption {
    id: number;
    odds: number;
    line?: number | null;
    display_name: string;
    is_active?: boolean;
    api_side_id?: 'home' | 'away' | 'over' | 'under' | 'yes' | 'no';
    api_stat_id?: string;
    api_bet_type_id?: string;
}

export interface GameDetails {
    id: number;
    home_team: string;
    away_team: string;
    home_team_abbr: string;
    away_team_abbr: string;
    game_time: string;
    status: string;
    bet_categories: BetCategory[] | null;
}

export interface BetCategory {
    main_category: string;
    displayName: string;
    markets: Market[];
}

export interface Market {
    market_name: string;
    player_name?: string | null;
    options: BetOption[];
}

export interface BetSlipOdd {
    id: number;
    selection_name?: string;
    odds_at_placement: number;
    line: number | null;
    bet_type_name: string;
    game_info_for_slip: {
        id: number;
        home_team: string;
        away_team: string;
        home_team_abbr: string;
        away_team_abbr: string;
    };
}

export interface BetPlacementSelection {
    available_bet_id: number;
}

export interface PlayerPropOverUnder {
    over: BetOption | null;
    under: BetOption | null;
}

export interface PlayerPropTouchdownOption {
    yes: BetOption | null;
    no: BetOption | null;
}

export interface PlayerPropTouchdown {
    anytime: PlayerPropTouchdownOption;
    first: PlayerPropTouchdownOption;
}

export interface StructuredPlayerProps {
    passing_yards: { [playerName: string]: PlayerPropOverUnder };
    rushing_yards: { [playerName: string]: PlayerPropOverUnder };
    receiving_yards: { [playerName: string]: PlayerPropOverUnder };
    touchdowns: { [playerName: string]: PlayerPropTouchdown };
}