# Third-party notices

## Dashboard Icons

- Project: [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons)
- Pinned source commit: `51cb393299f8c404e3792e01244746d253a1e480`
- Conceptual source URL:

  `https://raw.githubusercontent.com/homarr-labs/dashboard-icons/51cb393299f8c404e3792e01244746d253a1e480/svg/<icon>.svg`

- License: Apache License 2.0
- License copy: `licenses/dashboard-icons-LICENSE`

Only the SVG assets required by the built-in application library were vendored into
`apps/web/public/app-icons/`. The full upstream collection is not redistributed.

These icons are used at runtime as static local files. The application does not fetch
Dashboard Icons, GitHub, or any other CDN when rendering the library or App tiles.

Product names, trademarks, and logos remain the property of their respective owners.
Their presence in this repository is for identification of third-party services only.
Vesty Dashboard / this project does not claim ownership of those marks.

`code-server` uses the upstream `vscode.svg` asset, stored locally as
`apps/web/public/app-icons/code-server.svg`.
