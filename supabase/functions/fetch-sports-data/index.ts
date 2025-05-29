// File: supabase/functions/fetch-sports-data/index.ts
// Version 5.1.10 - Populate Player Name, Team ID, Affiliation in available_bets

import {serve} from 'std/http/server.ts';
import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {corsHeaders} from 'shared/cors.ts';

const FUNCTION_VERSION = 'v5.1.10 - Populate Player Details in available_bets';
console.log(`[Info] fetch-sports-data function booting up (${FUNCTION_VERSION})`);

// --- Type Definitions ---
interface StatusObject {
    hardStart?: boolean;
    delayed?: boolean;
    cancelled?: boolean;
    startsAt?: string;
    started?: boolean;
    displayShort?: string;
    completed?: boolean;
    displayLong?: string;
    ended?: boolean;
    live?: boolean;
    finalized?: boolean;
    currentPeriodID?: string;
    previousPeriodID?: string;
    oddsPresent?: boolean;
    oddsAvailable?: boolean;
    periods?: { ended?: string[], started?: string[] };
}

interface BookmakerOddDetail {
    odds: string;
    line?: string;
    overUnder?: string;
    spread?: string;
    lastUpdatedAt?: string;
}

interface OddData {
    oddID: string;
    opposingOddID?: string;
    marketName?: string;
    statID?: string;
    statEntityID?: string;
    periodID?: string;
    betTypeID?: string;
    sideID?: string;
    playerID?: string;
    fairOdds?: string;
    fairOverUnder?: string;
    fairSpread?: string;
    bookOdds?: string;
    bookOverUnder?: string;
    bookSpread?: string;
    score?: number;
    scoringSupported?: boolean;
    started?: boolean;
    ended?: boolean;
    cancelled?: boolean;
    lastUpdate?: string;
    byBookmaker?: Record<string, BookmakerOddDetail>;
}

interface EventInfo {
    seasonWeek?: string;
}

interface PlayerDetail {
    playerID: string;
    name: string;
    teamID: string;
    alias?: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
}

interface EventTeamNameDetails {
    short: string;
    medium: string;
    long: string;
}

interface EventTeamDataStructure {
    statEntityID: string;
    names: EventTeamNameDetails;
    teamID: string;
    colors?: any;
    score?: number;
} // teamID is API team ID like "SEATTLE_SEAHAWKS_NFL"
interface EventTeams {
    home: EventTeamDataStructure;
    away: EventTeamDataStructure;
}

interface EventData {
    eventID: string;
    sportID: string;
    leagueID: string;
    type?: string;
    info?: EventInfo;
    players?: Record<string, PlayerDetail>;
    startsAt: string;
    status: StatusObject;
    teams?: EventTeams;
    homeTeamName?: string;
    awayTeamName?: string;
    odds: Record<string, OddData>;
    lastUpdate: string;
    results?: any;
}

interface V2ApiResponseDataField {
    events?: EventData[];
    nextCursor?: string;
}

interface V2ApiResponse {
    success: boolean;
    message?: string;
    data?: EventData[] | V2ApiResponseDataField;
    error?: string;
}

interface BetTypeRecord {
    id: number;
    name: string;
    api_market_key: string;
    description?: string;
}

function getSupabaseAdminClient(): SupabaseClient {
    const su = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!su || !sk) {
        console.error(`[Crit] Missing SUPABASE_URL/SERVICE_KEY`);
        throw new Error('Server config err.');
    }
    return createClient(su, sk, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
}

function isPlausibleAmericanOdd(o?: string | null): boolean {
    if (!o || typeof o !== 'string') return !1;
    try {
        const n = parseFloat(o);
        if (isNaN(n) || (n === 0 && n !== -1 && n !== 1)) return !1;
        return n >= -30000 && n <= 30000
    } catch {
        return !1
    }
}

function isPotentiallyUsableOdd(o?: string | null): boolean {
    if (!o || typeof o !== 'string') return !1;
    try {
        const n = parseFloat(o);
        return !isNaN(n) && n !== 0 && n > -90000 && n < 90000
    } catch {
        return !1
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
    console.log(`[Info] Received ${req.method} request.`);
    try {
        const supabaseAdmin = getSupabaseAdminClient();
        const {data: btD, error: btE} = await supabaseAdmin.from('bet_types').select('*');
        if (btE || !btD) throw new Error('No bet types/DB err.');
        const btM = new Map(btD.map(bt => [bt.api_market_key, bt as BetTypeRecord]));
        console.log(`[Info] ${btM.size} bet types mapped.`);
        const nMK = new Set<string>();
        const API_KEY = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
        if (!API_KEY) throw new Error('API_KEY missing.');
        const p = new URL(req.url).searchParams;
        const sID = p.get('sportID') || 'FOOTBALL';
        const lID = p.get('leagueID') || 'NFL';
        const bkFilt = p.get('bookmakerID')?.toLowerCase();
        const lim = p.get('limit') || "3";
        let sA = p.get('startsAfter'), sB = p.get('startsBefore');
        if (!sA || !sB) {
            const t = new Date(), sD = new Date(new Date().setDate(t.getDate() + 7));
            sA = t.toISOString().split('T')[0] + 'T00:00:00Z';
            sB = sD.toISOString().split('T')[0] + 'T23:59:59Z';
        }
        const apiP: Record<string, string> = {
            sportID: sID,
            leagueID: lID,
            limit: lim,
            startsAfter: sA,
            startsBefore: sB
        };
        if (bkFilt) apiP.bookmakerID = bkFilt;
        const apiU = `https://api.sportsgameodds.com/v2/events/?${new URLSearchParams(apiP).toString()}`;
        console.log(`[Info] Fetching: ${apiU}`);
        const apiR = await fetch(apiU, {headers: {'X-Api-Key': API_KEY, 'Accept': 'application/json'}});
        console.log(`[Info] API Status: ${apiR.status}`);
        if (!apiR.ok) {
            const eB = await apiR.text();
            throw new Error(`API Fail: ${eB}`);
        }
        const evR = await apiR.json() as V2ApiResponse;
        let fEv: EventData[] = [];
        if (evR.success && evR.data) {
            if (Array.isArray(evR.data)) fEv = evR.data; else if (evR.data.events) fEv = evR.data.events;
        } else if (!evR.success) throw new Error(evR.message || evR.error || 'API no success.');
        console.log(`[Info] Rcvd ${fEv.length} evs.`);
        if (fEv.length === 0) return new Response(JSON.stringify({
            success: true,
            message: 'No evs.'
        }), {headers: corsHeaders});
        let gUC = 0, abUC = 0;
        const stats = {
            evP: 0,
            oddP: 0,
            oddSucP: 0,
            mS: 0,
            pS: 0,
            plS: 0,
            skNV: 0,
            skURO: 0,
            skIVO: 0,
            skUF: 0,
            skNBM: 0,
            skESN: 0
        };

        for (const event of fEv) {
            stats.evP++;
            const gS = event.status?.displayLong?.toLowerCase() || event.status?.displayShort?.toLowerCase() || 'unknown';
            const hTN = event.teams?.home?.names?.long || event.teams?.home?.names?.medium || event.homeTeamName || 'UnkHome';
            const aTN = event.teams?.away?.names?.long || event.teams?.away?.names?.medium || event.awayTeamName || 'UnkAway';
            const gameUpsertData = {
                api_game_id: event.eventID,
                home_team: hTN,
                away_team: aTN,
                game_time: event.startsAt || event.status?.startsAt || new Date(0).toISOString(),
                status: gS,
                last_odds_update: new Date().toISOString(),
                home_score: event.results?.game?.home?.points,
                away_score: event.results?.game?.away?.points,
                api_results_data: event.results?.game
            };
            const {
                data: gD,
                error: gE
            } = await supabaseAdmin.from('games').upsert(gameUpsertData, {onConflict: 'api_game_id'}).select('id,home_team,away_team').single();
            if (gE || !gD) {
                console.error(`[Err_GUpsert] ${event.eventID}:`, gE);
                continue;
            }
            gUC++;
            const gId = gD.id;
            const cH = gD.home_team;
            const cA = gD.away_team;
            const rawBets = [];
            if (event.odds && typeof event.odds === 'object' && Object.keys(event.odds).length > 0) {
                stats.oddP++;
                for (const oK in event.odds) {
                    const oD: OddData = event.odds[oK];
                    let sOS: string | undefined, sLS: string | undefined;
                    let srcOdd: string = "none_reas";
                    const tBkDet = bkFilt ? oD.byBookmaker?.[bkFilt] : undefined;
                    if (tBkDet?.odds && isPlausibleAmericanOdd(tBkDet.odds)) {
                        sOS = tBkDet.odds;
                        sLS = tBkDet.spread || tBkDet.line || tBkDet.overUnder;
                        srcOdd = `${bkFilt}_spec`;
                    } else if (oD.fairOdds && isPlausibleAmericanOdd(oD.fairOdds)) {
                        sOS = oD.fairOdds;
                        sLS = oD.fairSpread || oD.fairOverUnder;
                        srcOdd = "fairOdds";
                    } else if (oD.bookOdds && isPlausibleAmericanOdd(oD.bookOdds)) {
                        sOS = oD.bookOdds;
                        sLS = oD.bookSpread || oD.bookOverUnder;
                        srcOdd = "bookOdds_top";
                    } else if (oD.byBookmaker && !tBkDet) {
                        const pfb = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'betrivers', 'pointsbet', 'betonline', 'bovada'];
                        for (const bk of pfb) {
                            if (oD.byBookmaker[bk]?.odds && isPlausibleAmericanOdd(oD.byBookmaker[bk].odds)) {
                                sOS = oD.byBookmaker[bk].odds;
                                sLS = oD.byBookmaker[bk].spread || oD.byBookmaker[bk].line || oD.byBookmaker[bk].overUnder;
                                srcOdd = `byBk_${bk}`;
                                break;
                            }
                        }
                    }
                    if (!sOS) {
                        if (tBkDet?.odds && isPotentiallyUsableOdd(tBkDet.odds)) {
                            sOS = tBkDet.odds;
                            sLS = tBkDet.spread || tBkDet.line || tBkDet.overUnder;
                            srcOdd = `${bkFilt}_spec_fb`;
                        } else if (oD.fairOdds && isPotentiallyUsableOdd(oD.fairOdds)) {
                            sOS = oD.fairOdds;
                            sLS = oD.fairSpread || oD.fairOverUnder;
                            srcOdd = "fairOdds_fb";
                        } else if (oD.bookOdds && isPotentiallyUsableOdd(oD.bookOdds)) {
                            sOS = oD.bookOdds;
                            sLS = oD.bookSpread || oD.bookOverUnder;
                            srcOdd = "bookOdds_top_fb";
                        }
                        if (!sOS) {
                            stats.skURO++;
                            continue;
                        } else {
                            stats.skURO++;
                        }
                    }
                    let nO: number;
                    try {
                        nO = parseFloat(sOS);
                    } catch (e) {
                        stats.skIVO++;
                        continue;
                    }
                    let lV: number | undefined;
                    if (sLS) {
                        try {
                            lV = parseFloat(sLS);
                            if (isNaN(lV)) lV = undefined;
                        } catch (e) {
                            lV = undefined;
                        }
                    }
                    let iMK: string | undefined, sN: string | undefined;
                    let mBT: BetTypeRecord | undefined;
                    const sE = oD.statEntityID?.toLowerCase(), sd = oD.sideID?.toLowerCase(),
                        sAN = oD.statID?.toLowerCase(), bTA = oD.betTypeID?.toLowerCase();
                    let pNameForBet: string | null = null;
                    let pTeamIdForBet: string | null = null;
                    let pTeamAffiliation: string | null = null;

                    if (sE && oD.playerID && !['home', 'away', 'all'].includes(sE) && event.players?.[oD.playerID]) {
                        if (sAN && bTA) iMK = `player_${sAN}_${bTA}`;
                        const pInfo = event.players[oD.playerID];
                        if (pInfo) {
                            pNameForBet = pInfo.name || `${pInfo.firstName} ${pInfo.lastName}`;
                            pTeamIdForBet = pInfo.teamID;
                            if (event.teams?.home?.teamID === pTeamIdForBet) pTeamAffiliation = 'home';
                            else if (event.teams?.away?.teamID === pTeamIdForBet) pTeamAffiliation = 'away';
                        }
                    } else if (['1h', '2h', '1q', '2q', '3q', '4q'].includes(oD.periodID || '')) {
                        const pP = oD.periodID;
                        if (bTA === 'ml') iMK = `${pP}_ml`; else if (bTA === 'sp') iMK = `${pP}_sp`; else if (bTA === 'ou' && sE === 'all') iMK = `${pP}_totals_ou`; else if (bTA === 'ou' && sE === 'home') iMK = `${pP}_team_points_home_ou`; else if (bTA === 'ou' && sE === 'away') iMK = `${pP}_team_points_away_ou`; else if (bTA === 'eo' && sE === 'all') iMK = `${pP}_total_eo`; else if (bTA === 'eo' && sE === 'home') iMK = `${pP}_team_points_home_eo`; else if (bTA === 'eo' && sE === 'away') iMK = `${pP}_team_points_away_eo`;
                    } else if (['game', 'reg', 'ft'].includes(oD.periodID || '') || !oD.periodID) {
                        if (bTA === 'ml') iMK = 'h2h'; else if (bTA === 'sp') iMK = 'spreads'; else if (bTA === 'ou' && sE === 'all') iMK = 'totals'; else if (bTA === 'ou' && sE === 'home') iMK = 'team_points_home_ou'; else if (bTA === 'ou' && sE === 'away') iMK = 'team_points_away_ou'; else if (bTA === 'eo' && sE === 'all') iMK = 'game_total_eo'; else if (bTA === 'eo' && sE === 'home') iMK = 'team_points_home_eo'; else if (bTA === 'eo' && sE === 'away') iMK = 'team_points_away_eo'; else if (bTA === 'ml3way' && (oD.periodID === 'reg' || oD.periodID === 'game')) {
                            if (['home', 'away', 'draw'].includes(sd || '')) iMK = 'reg_ml3way'; else if (sd?.includes('+') || sd === 'not_draw') iMK = 'reg_double_chance';
                        }
                    } else {
                        stats.skUF++;
                        continue;
                    }
                    mBT = btM.get(iMK || '');
                    if (!mBT) {
                        if (iMK && !btM.has(iMK)) {
                            nMK.add(iMK);
                            console.log(`[DEBUG_NBM_New] Key:'${iMK}' for odd ${oD.oddID}`);
                        }
                        stats.skNBM++;
                        continue;
                    }

                    if (iMK.startsWith('player_')) {
                        const pID = oD.playerID!;
                        const pI = event.players![pID];
                        let pN = pNameForBet || pI?.nickname || pI?.name || (pI?.firstName && pI?.lastName ? `${pI.firstName} ${pI.lastName}` : pID.replace(/_[\d]+_NFL$/, '').replace(/_/g, ' '));
                        const bBN = mBT.name.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                        if (bTA === 'ou' && lV !== undefined) sN = `${pN} ${bBN} ${sd === 'over' ? 'Over' : 'Under'} ${lV}`; else if (bTA === 'yn') sN = `${pN} ${bBN} ${sd === 'yes' ? 'Yes' : 'No'}`; else sN = `${pN} ${bBN} (${sd})`;
                        stats.plS++;
                    } else if (iMK.startsWith('1q_') || iMK.startsWith('2q_') || iMK.startsWith('3q_') || iMK.startsWith('4q_') || iMK.startsWith('1h_') || iMK.startsWith('2h_')) {
                        if (iMK.endsWith('_ml')) sN = sE === 'home' ? cH : cA; else if (iMK.endsWith('_sp')) sN = `${sE === 'home' ? cH : cA} ${lV !== undefined && lV > 0 ? '+' : ''}${lV}`; else if (iMK.includes('_totals_ou') || (iMK.includes('_team_points') && iMK.endsWith('_ou'))) {
                            let tP = '';
                            if (iMK.includes('home')) tP = `${cH} `; else if (iMK.includes('away')) tP = `${cA} `;
                            sN = `${tP}${sd === 'over' ? 'Over' : 'Under'} ${lV}`;
                        } else if (iMK.endsWith('_eo')) {
                            const teamP = sE === 'home' ? `${cH} ` : sE === 'away' ? `${cA} ` : ``;
                            const periodDesc = mBT.name.match(/1st Half|2nd Half|1st Qtr|2nd Qtr|3rd Qtr|4th Qtr|Quarter|Half/i)?.[0] || '';
                            sN = `${teamP}${periodDesc ? periodDesc + ' ' : ''}Points ${sd === 'even' ? 'Even' : 'Odd'}`.trim().replace(/\s\s+/g, ' ');
                            if (!teamP && !periodDesc) sN = `Total Points ${sd === 'even' ? 'Even' : 'Odd'}`;
                        }
                        ;stats.pS++;
                    } else {
                        if (iMK === 'h2h') sN = sE === 'home' ? cH : cA; else if (iMK === 'spreads') sN = `${sE === 'home' ? cH : cA} ${lV !== undefined && lV > 0 ? '+' : ''}${lV}`; else if (iMK === 'totals') sN = `${sd === 'over' ? 'Over' : 'Under'} ${lV}`; else if (iMK === 'team_points_home_ou') sN = `${cH} ${sd === 'over' ? 'Over' : 'Under'} ${lV}`; else if (iMK === 'team_points_away_ou') sN = `${cA} ${sd === 'over' ? 'Over' : 'Under'} ${lV}`; else if (iMK.endsWith('_eo')) {
                            const tP = sE === 'home' ? `${cH} ` : sE === 'away' ? `${cA} ` : ``;
                            sN = `${tP}Total Points ${sd === 'even' ? 'Even' : 'Odd'}`.trim();
                            if (!tP) sN = `Game Total Points ${sd === 'even' ? 'Even' : 'Odd'}`;
                        } else if (iMK === 'reg_ml3way') {
                            if (sd === 'home') sN = cH; else if (sd === 'away') sN = cA; else if (sd === 'draw') sN = 'Draw';
                        } else if (iMK === 'reg_double_chance') {
                            if (sd === 'home+draw') sN = `${cH} or Draw`; else if (sd === 'away+draw') sN = `${cA} or Draw`; else if (sd === 'not_draw') sN = `${cH} or ${cA}`;
                        }
                        stats.mS++;
                    }

                    if (!sN || sN.trim() === '' || sN.includes('undefined') || sN.toLowerCase().includes('unknown')) {
                        stats.skESN++;
                        console.warn(`[Warn_ESN] Odd:${oD.oddID},Key:${iMK},Gen:'${sN}'.`);
                        continue;
                    }

                    let propSettleVal: number | null = null;
                    if (iMK.startsWith('player_') && oD.scoringSupported && typeof oD.score === 'number') propSettleVal = oD.score;

                    rawBets.push({
                        game_id: gId,
                        bet_type_id: mBT.id,
                        selection_name: sN,
                        odds: nO,
                        line: lV,
                        is_active: true,
                        source_bookmaker: bkFilt || srcOdd,
                        api_last_update: oD.byBookmaker?.[bkFilt || '']?.lastUpdatedAt || oD.lastUpdate || new Date().toISOString(),
                        statEntityID: oD.statEntityID,
                        prop_settlement_value: propSettleVal,
                        bet_subject_name: pNameForBet,
                        bet_subject_team_id: pTeamIdForBet,
                        bet_subject_team_affiliation: pTeamAffiliation
                    }); // Added new player fields
                    stats.oddSucP++;
                }
            }
            const uBetsMap = new Map<string, typeof rawBets[0]>();
            for (const b of rawBets) {
                const k = `${b.game_id}-${b.bet_type_id}-${b.selection_name}-${b.line ?? 'N/A'}`;
                if (!uBetsMap.has(k)) uBetsMap.set(k, b);
            }
            const betsToIns = Array.from(uBetsMap.values());
            if (betsToIns.length > 0) {
                const {error: insBetErr} = await supabaseAdmin.from('available_bets').upsert(betsToIns, {onConflict: 'game_id,bet_type_id,selection_name,line'});
                if (insBetErr) console.error(`[Err_AvailBetUpsert] Game ${gId}:`, insBetErr); else {
                    abUC += betsToIns.length;
                }
            } else console.log(`[Info] No new/unique odds for ${gId}.`);
        }
        if (nMK.size > 0) {
            console.log(`[Info_AutoBT] New keys:`, Array.from(nMK));
        }
        const summary = `FN(${FUNCTION_VERSION}) done. EvF:${fEv.length},GU:${gUC},BU:${abUC}.`;
        console.log(`[Summ] ${summary}`);
        console.log('[Summ_Stats] Detail:', JSON.stringify(stats, null, 2));
        return new Response(JSON.stringify({success: true, message: summary, data: {stats}}), {headers: corsHeaders});
    } catch (error) {
        console.error(`[FATAL](${FUNCTION_VERSION}):`, error.message, error.stack);
        return new Response(JSON.stringify({
            success: false,
            error: `Internal Err: ${error.message}`
        }), {headers: corsHeaders, status: 500});
    }
});