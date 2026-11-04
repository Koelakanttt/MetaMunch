import type { DatabaseSync } from 'node:sqlite'
import type { IpcHandlers } from '@shared/ipc'
import { parseResearchFilters } from '@shared/research'
import { backupDatabase } from '../db/backup'
import { getSchemaVersion } from '../db/migrate'
import type { NetworkDiagnosticsProvider } from '../providers/network-diagnostics'
import type { RiotRequestManager } from '../providers/riot-request-manager'
import type { ChampionSelectService } from '../services/champion-select-service'
import type { LiveGameService } from '../services/live-game-service'
import type { LpService } from '../services/lp-service'
import type { MatchHistoryService } from '../services/match-history-service'
import type { MatchSyncService } from '../services/match-sync-service'
import type { MatchTimelineService } from '../services/match-timeline-service'
import type { MatchReviewService } from '../services/match-review-service'
import type { MatchupService } from '../services/matchup-service'
import type { PatchChangesService } from '../services/patch-changes-service'
import type { PoolService } from '../services/pool-service'
import type { PostGameService } from '../services/post-game-service'
import type { PurchaseOrderService } from '../services/purchase-order-service'
import type { RecommendationService } from '../services/recommendation-service'
import type { ResearchService } from '../services/research-service'
import type { ResearchBuildService } from '../services/research-build-service'
import type { RuneService } from '../services/rune-service'
import type { SettingsService } from '../services/settings-service'
import type { SkillOrderService } from '../services/skill-order-service'
import type { StatsCoordinator } from '../services/stats-coordinator'
import type { StaticDataService } from '../services/static-data-service'
import type { SynergyService } from '../services/synergy-service'
import type { TimelineBackfillService } from '../services/timeline-backfill-service'
import type { TimelineSummaryService } from '../services/timeline-summary-service'

export function createHandlers(deps: {
  db: DatabaseSync
  appVersion: string
  dataPath: string
  backupDir: string
  staticData: StaticDataService
  matchSync: MatchSyncService
  matchHistory: MatchHistoryService
  matchTimeline: MatchTimelineService
  matchReview: MatchReviewService
  research: ResearchService
  researchBuild: ResearchBuildService
  recommendation: RecommendationService
  patchChanges: PatchChangesService
  pool: PoolService
  generalStats: StatsCoordinator
  championSelect: ChampionSelectService
  liveGame: LiveGameService
  lp: LpService
  postGame: PostGameService
  matchups: MatchupService
  synergies: SynergyService
  runes: RuneService
  purchaseOrder: PurchaseOrderService
  skillOrder: SkillOrderService
  timelineBackfill: TimelineBackfillService
  timelineSummary: TimelineSummaryService
  settings: SettingsService
  diagnostics: NetworkDiagnosticsProvider
  riot: RiotRequestManager
}): IpcHandlers {
  return {
    'app:ping': ({ message }) => ({ reply: 'pong: ' + message, at: Date.now() }),
    'db:info': () => {
      const row = deps.db.prepare('SELECT sqlite_version() AS v').get() as
        | { v?: unknown }
        | undefined
      return {
        schemaVersion: getSchemaVersion(deps.db),
        sqliteVersion: String(row?.v ?? ''),
        appVersion: deps.appVersion,
        dataPath: deps.dataPath,
      }
    },
    'db:backup': () => ({ path: backupDatabase(deps.db, deps.backupDir) }),
    'staticData:status': () => {
      const status = deps.staticData.status()
      if (!status) {
        return { version: null, champions: 0, items: 0, fetchedAt: null }
      }
      return {
        version: status.version,
        champions: status.champions,
        items: status.items,
        fetchedAt: status.fetchedAt,
      }
    },
    'staticData:refresh': () => deps.staticData.refresh(),
    'settings:get': () => ({
      ...deps.settings.status(),
      region: deps.settings.region(),
      leaguePath: deps.settings.leaguePath(),
      externalStatsEnabled: deps.settings.externalStatsEnabled(),
      theme: deps.settings.theme(),
      labsEnabled: deps.settings.labsEnabled(),
      disclaimerAcknowledged: deps.settings.disclaimerAcknowledged(),
      researchFilters: deps.settings.researchFilters(),
      researchTimelineMode: deps.settings.researchTimelineMode(),
    }),
    'diagnostics:network': () =>
      deps.diagnostics.run({
        apiKey: deps.settings.getKey(),
        region: deps.settings.region(),
      }),
    'riot:status': () => deps.riot.status(),
    'riot:retry': () => {
      deps.riot.resetCircuit()
      return deps.riot.status()
    },
    'settings:setRiotKey': ({ key }) => {
      deps.settings.saveRiotKey(key)
      return { ok: true }
    },
    'settings:setRegion': ({ region }) => {
      deps.settings.saveRegion(region)
      return { ok: true }
    },
    'settings:setLeaguePath': ({ path }) => {
      deps.settings.saveLeaguePath(path)
      return { ok: true }
    },
    'settings:setExternalStats': ({ enabled }) => {
      deps.settings.saveExternalStats(enabled)
      return { ok: true }
    },
    'settings:setLabs': ({ enabled }) => {
      deps.settings.saveLabs(enabled)
      return { ok: true }
    },
    'settings:ackDisclaimer': () => {
      deps.settings.acknowledgeDisclaimer()
      return { ok: true }
    },
    'settings:setResearchFilters': (filters) => {
      deps.settings.saveResearchFilters(filters)
      return { ok: true }
    },
    'settings:setResearchTimelineMode': ({ mode }) => {
      deps.settings.saveResearchTimelineMode(mode)
      return { ok: true }
    },
    'settings:setTheme': ({ theme }) => {
      deps.settings.saveTheme(theme)
      return { ok: true }
    },
    'account:set': async ({ riotId }) => {
      const account = await deps.matchSync.setAccount(riotId)
      return { gameName: account.gameName, tagLine: account.tagLine }
    },
    'matches:status': () => deps.matchSync.status(),
    'matches:sync': async () => {
      const result = await deps.matchSync.sync()
      void deps.timelineSummary.ensureRecent()
      return result
    },
    'matches:history': (filters) => deps.matchHistory.list(filters),
    'matches:timeline': ({ matchId }) => deps.matchTimeline.forMatch(matchId),
    'review:get': ({ matchId }) => deps.matchReview.get(matchId),
    'review:save': ({ matchId, review }) => deps.matchReview.save(matchId, review),
    'review:pending': () => deps.matchReview.pending(),
    'champions:list': () => deps.recommendation.listChampions(),
    'recommend:run': (req) => deps.recommendation.run(req),
    'patch:changes': (request) => deps.patchChanges.run(request),
    'patch:abilityStart': ({ championIds }) => deps.patchChanges.startAbilityLoad(championIds),
    'patch:abilityStatus': () => deps.patchChanges.abilityStatus(),
    'pool:list': () => deps.pool.list(),
    'stats:general': (filters) => deps.generalStats.run(filters),
    'research:status': (req) => deps.research.status(req.filters),
    'research:summary': (req) => deps.research.summary(req.filters),
    'research:audit': ({ championId, role, filters }) =>
      deps.research.audit(championId, role, filters),
    'research:build': ({ championId, role, filters, opponentId }) =>
      deps.researchBuild.forChampion(
        championId,
        role,
        parseResearchFilters(filters),
        opponentId ?? null,
      ),
    'research:start': (options) => deps.research.start(options),
    'research:pause': () => deps.research.pause(),
    'research:resume': () => deps.research.resume(),
    'research:stop': () => deps.research.stop(),
    'research:setOptions': (options) => deps.research.setOptions(options),
    'research:collect': ({ targetMatches }) => deps.research.collect(targetMatches),
    'champSelect:status': () => deps.championSelect.status(),
    'timeline:purchaseOrder': ({ championId }) => deps.purchaseOrder.forChampion(championId),
    'timeline:skillOrder': ({ championId, opponentId, source }) =>
      deps.skillOrder.forChampion(championId, opponentId, source),
    'matches:backfillTimelines': () => deps.timelineBackfill.run(),
    'review:summary': ({ matchId }) => deps.timelineSummary.view(matchId),
    'lp:history': () => deps.lp.history(),
    'live:status': () => deps.liveGame.status(),
    'review:last': () => deps.postGame.review(),
    'matchups:list': ({ championId }) => deps.matchups.forChampion(championId),
    'synergies:list': ({ championId }) => deps.synergies.forChampion(championId),
    'runes:popular': ({ championId, role, opponentId, source, filters }) =>
      deps.runes.popular(
        championId,
        role,
        opponentId,
        source,
        parseResearchFilters(filters),
      ),
  }
}
