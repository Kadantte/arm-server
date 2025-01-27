import { z } from "zod"

// Does not include `thetvdb` due to the one-to-many issue
export const numberIdSourceSchema = z.enum([
	"anilist",
	"anidb",
	"anisearch",
	"kitsu",
	"livechart",
	"myanimelist",
])

export const stringIdSourceSchema = z.enum(["anime-planet", "notify-moe"])
