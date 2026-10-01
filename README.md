# Stompstart startup list

Propose a new startup for [Stompstart](https://stompstart.com) by pull request. One pull
request adds one startup: `startups/<slug>.yaml`, with its logo and product images in
`startups/<slug>/`.

## What gets listed

Stompstart lists startups at launch: real products with a public launch, not side projects, demos,
games or one-off utilities. A startup is eligible when it first appeared in public in the six
months before your pull request opened: its first release, or for a prelaunch product, the opening
of its waitlist or signup. It needs:

- an official website on its own domain, not a shared or temporary host such as vercel.app,
  github.io or a tunnel, and a way in that works: signup, waitlist, demo, download, install or
  browse;
- its launch, with the page that dates it: the announcement, release post or listing, not the
  code repository (a prelaunch product leaves the launch out);
- its own logo, from its site or press kit: PNG or WebP, square or close to it, 256 to 1,600
  pixels, and an original at that size, never one of the site's smaller icons enlarged (render
  the site's SVG logo, or use its press kit or app icon);
- pictures of the product if you have them, 1,200 to 1,600 pixels wide and listed first. The
  site's share image may follow as an extra but does not count; with no product picture,
  Stompstart takes a screenshot of the homepage at review;
- a description in your own words, with sources for its claims;
- to be new here: not on Stompstart already, live or in the archive, and not proposed by an
  earlier open pull request. The first open pull request for a startup holds it.

## Propose a startup

```sh
npm ci
npm run new -- your-startup-slug
```

Replace every sample value in `startups/your-startup-slug.yaml`, put the logo and product images
in `startups/your-startup-slug/` under the names the file gives them, then check it:

```sh
npm run validate
npm run eligibility -- your-startup-slug
```

The [example](examples/startup.yaml) explains the fields and the
[schema](startup-input.schema.json) is exact. The pull request runs both checks again; a check
marked for review passes, and a reviewer looks at it.

## After the pull request

Passing checks is not publication. Stompstart captures the sources, reviews the exact revision and
publishes eligible startups in a signed release. The startup's page on stompstart.com then credits
the pull request and its author. Pull requests are not merged: publication is the result. If a
review finds a problem, the pull request gets a finding to fix; amend the same pull request.
Payment for priority review never changes eligibility, placement or approval, and corrections are
always free.

## Launches for startups already listed

A first release or a major update to a startup already on Stompstart is a launch file:

```sh
npm run new:launch -- published-startup-slug launch-name
```

Edit `launches/published-startup-slug/launch-name.yaml` from the [launch
example](examples/launch.yaml). A launch cites the page that announced it and the passage that
dates it; a routine changelog entry is not a launch.

## Licences

Text you write here is [CC BY 4.0](LICENSE-DATA.md). Logos and product images stay their owners';
they identify the startup. The checks and scripts are [MIT](LICENSE-CODE). The schemas and checks
are exported from Stompstart, and [contract-source.json](contract-source.json) pins the exact
export. See [CONTRIBUTING](CONTRIBUTING.md) for credit and corrections.
