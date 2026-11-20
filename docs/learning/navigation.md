# Screens and navigation with Expo Router

The app is a set of screens: Home, Search, a playlist, the player and others. This note explains how those screens are defined, what happens from tapping the app icon to seeing Home, and how the app moves from one screen to another.

## The parts

**React Native.** A framework that runs React code on a phone and turns components such as `<View>` and `<Text>` into real Android views. [Expo, and how the app becomes an APK](expo-and-the-apk.md) explains it, and Expo, in more detail.

**Screen.** One full page of the app, such as the playlist screen or the player. In the code, a screen is a React component.

**Navigator.** A component that holds several screens and decides which one is shown and how you move between them. AudioStash uses two kinds:

- A **stack** keeps screens in a pile, like a pile of cards. Opening a screen puts it on top. Going back takes it off and shows the one underneath, exactly as you left it.
- **Tabs** keep screens side by side, with a tab bar at the bottom to switch between them.

**React Navigation.** The library that provides the stack, the tabs and the animations between screens. It is the usual navigation library for React Native.

**Expo Router.** A layer on top of React Navigation. It adds two things: each file in `src/app` becomes a screen, and each screen gets an address, like a page on a website.

## Files are screens

Expo Router reads the `src/app` folder and turns every file in it into a screen. The address of a screen is its file's path:

```
src/app/
├── _layout.tsx              the root layout: a stack
├── (tabs)/
│   ├── _layout.tsx          the tabs layout: the tab bar
│   ├── index.tsx            /             Home
│   ├── search.tsx           /search
│   ├── downloads.tsx        /downloads
│   └── playlists.tsx        /playlists
├── playlist/
│   └── [id].tsx             /playlist/abc123, /playlist/all
├── now-playing.tsx          /now-playing
├── music-folder.tsx         /music-folder
├── settings.tsx             /settings
├── sign-in.tsx              /sign-in
└── …
```

A screen file must have a **default export**: the component Expo Router shows. Nothing in the app imports these files. Expo Router finds them itself, so the component's name does not matter, only the file's location. The reason this works: `package.json` sets `"main": "expo-router/entry"`, so the app starts in Expo Router's code, not ours. That code asks Metro, the bundler, for every file under `src/app` at build time.

Because every file there becomes a screen, helpers and shared components live outside `src/app`, in `src/ui`, `src/player` and the other folders.

Some names have a special meaning:

| Name          | Meaning                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_layout.tsx` | Not a screen. It wraps the screens in its folder (see below).                                                                                                                                |
| `index.tsx`   | The folder's default screen, like `index.html` on a website. `(tabs)/index.tsx` is at `/`.                                                                                                   |
| `[id].tsx`    | A **dynamic route**: one file for many addresses. `/playlist/abc123` and `/playlist/all` both open `playlist/[id].tsx`. The screen reads the part in brackets with `useLocalSearchParams()`. |
| `(tabs)/`     | A **route group**: a folder that groups screens and can give them their own layout, but adds nothing to the address. `(tabs)/search.tsx` is at `/search`, not `/(tabs)/search`.              |

The route group exists so the four tabs can share one tab bar layout without every address starting with `/tabs/`.

## Layouts

A `_layout.tsx` file decides **how** the screens beside it are shown. The files decide **which** screens exist: a new `src/app/foo.tsx` is a screen at `/foo` without being listed anywhere.

- The root [`_layout.tsx`](../../apps/mobile/src/app/_layout.tsx) renders a `<Stack>`. Its `<Stack.Screen name="…">` lines do not create screens. They set options, such as the slide-up animation of the player or the see-through background of the "Add to a playlist" sheet.
- [`(tabs)/_layout.tsx`](../../apps/mobile/src/app/(tabs)/_layout.tsx) renders `<Tabs>`, with a custom tab bar that also holds the mini player.

Navigators nest. The tabs navigator is one card in the root stack, the bottom one. Screens outside `(tabs)` are pushed on top of it and cover the whole display, tab bar included. So the rule is:

- a file **inside** `(tabs)` is a tab, and opening it switches tabs;
- a file **outside** `(tabs)` slides in on top of everything.

The root layout also does the app's start-up work before any screen is shown. It keeps the splash screen up while the fonts load and the local database opens. Then it wraps every screen in the providers the app needs: safe areas (the space around the camera cut-out and the navigation bar), Clerk for sign-in, and React Query for data.

## From the app icon to Home

1. **Android starts the app.** The APK contains `MainActivity`, a class that prebuild writes into the `android` folder. An **activity** is Android's name for one full-screen window. AudioStash has just one; React Native draws every screen inside it.
2. **Hermes runs the JavaScript.** Hermes, the JavaScript engine, loads the bundle inside the APK and runs its entry file, `expo-router/entry`.
3. **Expo Router builds the tree** of screens from the files in `src/app`.
4. **The root layout renders.** It waits for the fonts and the database, then shows the stack.
5. **The first screen opens.** The app starts at `/`, which is `(tabs)/index.tsx`: Home, inside the tab bar. If you are signed out, you see the sign-in screen instead (next section).
6. **On the first run only,** the tabs layout checks whether a music folder has been chosen. If not, it opens `/music-folder` on top of Home, because songs cannot be saved until one is chosen.

## Signed in and signed out

The root layout puts the screens in two groups with `Stack.Protected`:

```tsx
<Stack.Protected guard={signedIn}>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="playlist/[id]" />
  …
</Stack.Protected>
<Stack.Protected guard={!signedIn}>
  <Stack.Screen name="sign-in" />
</Stack.Protected>
```

A screen inside a `Stack.Protected` exists only while its `guard` is true. Signed out, the sign-in screen is the only one, so that is what you see.

The sign-in screen never navigates anywhere itself. When you sign in, Clerk stores the session and `useAuth()` reports `isSignedIn: true`. The guards flip: the sign-in screen no longer exists, and the others do. Expo Router moves you to the first screen that now exists, `(tabs)`, whose default screen is Home. Signing out flips the guards back.

The reason for doing it this way: no screen has to remember to check whether you are signed in. A screen behind the guard simply cannot be shown while signed out.

Next to the stack, the root layout renders `{signedIn ? <Session /> : null}`. `Session` draws nothing (`return null`). It exists for its effect, which calls `startSession` in [`session.ts`](../../apps/mobile/src/session.ts) to start sync, the live event stream from the server and the saving of songs to the music folder. React runs an effect when the component first appears and runs the function the effect returns when it disappears. `startSession` returns a function that stops everything it started. So the background work runs exactly while you are signed in, with no separate start and stop code.

## Moving between screens

`router` from `expo-router` moves between screens:

| Call                     | What it does                                                   |
| ------------------------ | -------------------------------------------------------------- |
| `router.push('/x')`      | Puts `/x` on top of the stack. Back returns to where you were. |
| `router.back()`          | Takes the top screen off the stack.                            |
| `router.replace('/x')`   | Swaps the top screen for `/x`, so Back skips the old one.      |
| `<Redirect href="/x" />` | A component that does a replace as soon as it is shown.        |

For example, `router.push('/music-folder')`:

1. Expo Router matches `/music-folder` to `src/app/music-folder.tsx`.
2. The file is outside `(tabs)`, so the screen is pushed onto the root stack, over the tab bar, sliding in from the right.
3. Home stays alive underneath, with its scroll position.
4. When you pick a folder, or tap Back, the screen calls `router.back()`, and Home shows again exactly as it was.

The phone's own Back gesture does the same as `router.back()`.

## Addresses and deep links

A phone app has no address bar, and opening a screen fetches nothing: every screen is already inside the APK. The address is a short way to name a screen and its data. `/playlist/abc123` says "the playlist screen, for playlist `abc123`" in one string.

Android also lets a link open an app. `app.config.ts` sets `scheme: 'audiostash'`, so a link such as `audiostash://playlist/abc123` launches AudioStash straight onto that screen. This is called a **deep link**.

The app relies on one: signing in with Google. Clerk opens Google's sign-in page in the browser. When it finishes, the browser opens `audiostash://sso-callback`, which brings you back to the app at [`sso-callback.tsx`](../../apps/mobile/src/app/sso-callback.tsx). That screen does only `<Redirect href="/" />`, which sends you to Home.
