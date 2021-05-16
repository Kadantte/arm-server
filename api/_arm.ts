import fetch from "node-fetch"

import { captureException } from "@sentry/node"

import { Logger } from "./_logger"
import { updateBasedOnManualRules } from "./_manual-rules"
import { OfflineDatabaseData, OfflineDatabaseEntry, Relation } from "./_types"

type RelationMap = Map<`${keyof Relation}:${number}`, Relation>

export class ARMData {
  #entries: Relation[] = []
  #map: RelationMap = new Map()

  #regexes = {
    anilist: /anilist.co\/anime\/(\d+)$/,
    anidb: /anidb.net\/a(?:nime\/)?(\d+)$/,
    mal: /myanimelist.net\/anime\/(\d+)$/,
    kitsu: /kitsu.io\/anime\/(.+)$/,
  }

  private getMapKey = (source: keyof Relation, id: number) => `${source}:${id}` as const

  private formatEntry = (entry: OfflineDatabaseEntry): Relation => {
    const relation: Relation = {
      anilist: null,
      anidb: null,
      kitsu: null,
      myanimelist: null,
    }

    entry.sources.forEach((src) => {
      const anilistMatch = this.#regexes.anilist.exec(src)
      if (anilistMatch) {
        const id = Number(anilistMatch[1])

        if (isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

        relation.anilist = id
      }

      const anidbMatch = this.#regexes.anidb.exec(src)
      if (anidbMatch) {
        const id = Number(anidbMatch[1])

        if (isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

        relation.anidb = id
      }

      const malMatch = this.#regexes.mal.exec(src)
      if (malMatch) {
        const id = Number(malMatch[1])

        if (isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

        relation.myanimelist = id
      }

      const kitsuMatch = this.#regexes.kitsu.exec(src)
      if (kitsuMatch) {
        const id = Number(kitsuMatch[1])

        if (isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

        relation.kitsu = id
      }
    })

    return relation
  }

  private createEntryMap = (): RelationMap => {
    const newMap: RelationMap = new Map()

    this.#entries.forEach((relation) => {
      const entries = Object.entries(relation) as [keyof Relation, number][]

      entries.forEach(([source, id]) => {
        newMap.set(this.getMapKey(source, id), relation)
      })
    })

    return newMap
  }

  private fetchDatabase = async (): Promise<OfflineDatabaseEntry[] | null> => {
    const response = await fetch(
      "https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database.json",
    ).catch((err: Error) => err)

    if (response instanceof Error || response.status >= 400) {
      const error = new Error(
        `Failed to fetch updated database!\n${
          response instanceof Error ? response.message : response.status
        }`,
      )

      Logger.error(error)
      captureException(error)

      return null
    }

    return ((await response.json()) as OfflineDatabaseData).data
  }

  public updateDatabase = async () => {
    Logger.info("Fetching updated Database...")
    const data = await this.fetchDatabase()
    Logger.info("Fetched updated Database.")

    if (data == null) {
      Logger.info("got no data")
      return
    }

    Logger.info("Formatting data...")
    this.#entries = data.map(this.formatEntry)
    Logger.info("Formatted data.")

    Logger.info("Executing manual rules...")
    this.#entries = updateBasedOnManualRules(this.#entries)

    Logger.info("Creating entry map...")
    this.#map = this.createEntryMap()

    Logger.info("Done.")
  }

  public getRelation = async (source: keyof Relation, id: number) => {
    if (this.#entries.length < 1) {
      await this.updateDatabase()
    }

    return this.#map.get(this.getMapKey(source, id)) ?? null
  }
}
