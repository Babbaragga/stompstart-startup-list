// The shape of every file: startups against the startup input schema, their images, and
// launches against the launch input schema. The schemas and checks are exported from Stompstart
// and pinned by digest in contract-source.json.
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import YAML from "yaml";
import { readImageHeader } from "../vendor/stompstart/modules/media/src/index.js";
import { validateLaunch, validateStartup } from "./schemas.mjs";

const root = new URL("../", import.meta.url);
const source = JSON.parse(await readFile(new URL("contract-source.json", root), "utf8"));
for (const [path, sha256] of Object.entries(source.files)) {
  const bytes = await readFile(new URL(path, root));
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
    throw new Error(`${path} differs from its recorded export.`);
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_IMAGES = 12;
const MAX_EDGE = 1_600;
const errors = [];

async function categories() {
  try {
    const response = await fetch("https://stompstart.com/api/taxonomy", {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    return new Set(body.taxonomy.categories.map((category) => category.id));
  } catch {
    process.stderr.write("Could not read Stompstart's categories; skipping that check.\n");
    return null;
  }
}

function parse(text, label) {
  const document = YAML.parseDocument(text, { uniqueKeys: true, strict: true });
  if (document.errors.length) {
    errors.push(...document.errors.map((error) => `${label}: ${error.message}`));
    return null;
  }
  const fields = document.toJS({ maxAliasCount: 0 });
  if (fields && typeof fields === "object" && "input_contract" in fields) {
    errors.push(`${label}: the file holds fields only; remove input_contract`);
    return null;
  }
  return fields;
}

function shapeErrors(validate, label) {
  return (validate.errors ?? []).map((error) => `${label}: ${error.instancePath || "/"} ${error.message}`);
}

const known = await categories();
const startups = new URL("startups/", root);
for (const name of (await readdir(startups)).sort()) {
  if (name === ".gitkeep") continue;
  const entry = await stat(new URL(name, startups));
  if (entry.isDirectory()) {
    if (!SLUG.test(name)) errors.push(`startups/${name}/: name the folder after its startup's slug`);
    const inside = await readdir(new URL(`${name}/`, startups));
    if (inside.some((file) => file.endsWith(".yaml"))) {
      errors.push(`startups/${name}/: the startup file goes beside its folder, as startups/${name}.yaml`);
    } else if (!(await readdir(startups)).includes(`${name}.yaml`)) {
      errors.push(`startups/${name}/: images need their startup file, startups/${name}.yaml`);
    }
    continue;
  }
  const slug = name.replace(/\.yaml$/u, "");
  if (!name.endsWith(".yaml") || !SLUG.test(slug) || slug.length > 80) {
    errors.push(`startups/${name}: use startups/<slug>.yaml with a lowercase slug`);
    continue;
  }
  const label = `startups/${name}`;
  const fields = parse(await readFile(new URL(name, startups), "utf8"), label);
  if (!fields) continue;
  if (!validateStartup(fields)) {
    errors.push(...shapeErrors(validateStartup, label));
    continue;
  }
  if (fields.name === "Example Product" || new URL(fields.website).hostname === "example.com") {
    errors.push(`${label}: replace the example product and its addresses`);
  }
  if (known) {
    for (const category of fields.categories) {
      if (!known.has(category)) errors.push(`${label}: ${category} is not a Stompstart category`);
    }
  }
  if ((fields.surfaces ?? []).some((surface) => surface.citations !== undefined)) {
    errors.push(`${label}: surfaces carry no citations; editors attach evidence`);
  }
  const named = [fields.logo, ...(fields.gallery ?? [])].filter(Boolean);
  if (named.length > MAX_IMAGES) errors.push(`${label}: name at most ${MAX_IMAGES} images, logo included`);
  let beside = [];
  try {
    beside = (await readdir(new URL(`${slug}/`, startups))).filter((file) => file !== ".gitkeep");
  } catch {
    beside = [];
  }
  const paths = new Set(named.map((image) => image.path));
  for (const file of beside) {
    if (!paths.has(file)) errors.push(`startups/${slug}/${file}: the startup file does not name this image`);
  }
  for (const image of named) {
    if (!beside.includes(image.path)) {
      errors.push(`${label}: ${image.path} is missing from startups/${slug}/`);
      continue;
    }
    try {
      const header = readImageHeader(await readFile(new URL(`${slug}/${image.path}`, startups)));
      if (Math.max(header.width, header.height) > MAX_EDGE) {
        errors.push(`startups/${slug}/${image.path}: at most ${MAX_EDGE} pixels on its long side`);
      }
    } catch (error) {
      errors.push(`startups/${slug}/${image.path}: ${error.message}`);
    }
  }
}

const launches = new URL("launches/", root);
for (const folder of (await readdir(launches)).sort()) {
  if (folder === ".gitkeep") continue;
  if (!SLUG.test(folder)) {
    errors.push(`launches/${folder}: use launches/<startup-slug>/<name>.yaml`);
    continue;
  }
  for (const name of (await readdir(new URL(`${folder}/`, launches))).sort()) {
    const label = `launches/${folder}/${name}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$/u.test(name)) {
      errors.push(`${label}: use a lowercase .yaml name`);
      continue;
    }
    const fields = parse(await readFile(new URL(`${folder}/${name}`, launches), "utf8"), label);
    if (!fields) continue;
    if (!validateLaunch(fields)) {
      errors.push(...shapeErrors(validateLaunch, label));
      continue;
    }
    if (fields.title === "Example Product 2.0" || new URL(fields.source.url).hostname === "example.com") {
      errors.push(`${label}: replace the example launch and its source`);
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Every startup and launch file has a valid shape.\n");
}
