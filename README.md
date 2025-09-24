# Guitar Hero

## Usage
Unzip samples.zip

Setup (requires node.js):

```bash
> npm install
```

Start tests:

```bash
> npm test
```

Serve up the App (and ctrl-click the URL that appears in the console)

```bash
> npm run dev
```


## Implementing features

There are a few files you may wish to modify. The rest should **not** be modified as they are used for configuring the build.

`src/main.ts`

-   Code file used as the entry point
-   Most of your game logic should go here
-   Contains main function that is called on page load

`src/style.css`

-   Stylesheet
-   You may edit this if you wish

`index.html`

-   Main html file
-   Contains scaffold of game window and some sample shapes
-   Feel free to add to this, but avoid changing the existing code, especially the `id` fields

`test/*.test.ts`

-   If you want to add tests, these go here
-   Uses [`vitest`](https://vitest.dev/api/)


