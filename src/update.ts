import Http from "got"

import { captureException } from "@sentry/node"

import { logger } from "@/lib/logger"

import { knex, Relation } from "./db"
import { updateBasedOnManualRules } from "./manual-rules"

type OfflineDatabaseSchema = {
  sources: string[]
  type: string
  title: string
  picture: string
  relations: string[]
  thumbnail: string
  episodes: number
  synonyms: string[]
}

const fetchDatabase = async (): Promise<OfflineDatabaseSchema[] | null> => {
  const response = await Http.get<{ data: OfflineDatabaseSchema[] }>(
    "https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json",
    {
      responseType: "json",
    },
  )

  if (response.statusCode !== 200) {
    console.error("Could not fetch updated database!!")
    captureException(new Error("Could not fetch updated database!!"))

    return null
  }

  return response.body.data
}

const regexes = {
  anilist: /anilist.co\/anime\/(\d+)$/,
  anidb: /anidb.net\/a(?:nime\/)?(\d+)$/,
  mal: /myanimelist.net\/anime\/(\d+)$/,
  kitsu: /kitsu.io\/anime\/(.+)$/,
}

const formatEntry = (entry: OfflineDatabaseSchema): Relation => {
  const relation: Relation = {}

  for (const src of entry.sources) {
    const anilistMatch = regexes.anilist.exec(src)
    if (anilistMatch) {
      const id = Number(anilistMatch[1])

      if (Number.isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

      relation.anilist = id
    }

    const anidbMatch = regexes.anidb.exec(src)
    if (anidbMatch) {
      const id = Number(anidbMatch[1])

      if (Number.isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

      relation.anidb = id
    }

    const malMatch = regexes.mal.exec(src)
    if (malMatch) {
      const id = Number(malMatch[1])

      if (Number.isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

      relation.myanimelist = id
    }

    const kitsuMatch = regexes.kitsu.exec(src)
    if (kitsuMatch) {
      const id = Number(kitsuMatch[1])

      if (Number.isNaN(id)) throw new Error(`${src}'s ID is not a number!!`)

      relation.kitsu = id
    }
  }

  return relation
}

export const updateRelations = async () => {
  logger.debug(`Using ${process.env.NODE_ENV!} database configuration...`)

  logger.info("Fetching updated Database...")
  const data = await fetchDatabase()
  logger.info("Fetched updated Database.")

  if (data == null) {
    logger.error("got no data")
    return
  }

  logger.info("Formatting entries...")
  const formattedEntries = data
    .map(formatEntry)
    .filter((entry) => Object.keys(entry).length > 1)
  logger.info({ amount: formattedEntries.length }, `Formatted entries.`)

  logger.info("Updating database...")
  await knex.transaction((trx) =>
    knex
      .delete()
      .from("relations")
      .transacting(trx)
      .then(() => knex.batchInsert("relations", formattedEntries, 100).transacting(trx)),
  )
  logger.info("Updated database.")

  logger.info("Executing manual rules...")
  await updateBasedOnManualRules()

  logger.info("Done.")

  if (process.argv.includes("--exit")) {
    await knex.destroy()
  }
}
