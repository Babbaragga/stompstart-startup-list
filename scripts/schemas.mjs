// The exported input schemas, compiled once for the scripts that check files against them.
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const schema = async (path) => ajv.compile(JSON.parse(await readFile(new URL(path, root), "utf8")));

export const validateStartup = await schema("startup-input.schema.json");
export const validateLaunch = await schema("launch-input.schema.json");
