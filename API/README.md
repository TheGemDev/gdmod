## API

Here are the utilities to load mods, and make it easier to code them.

### Type Checking

If you want to use typechecking while working on the API, you need to have cloned GDevelops repository next to GDMods directory.
Your directory tree should look like this:

```
|
|- GDevelop
|-- GDJS
|-- Extensions
|-- ...
|- GDMod
|-- API
|-- Loader
|-- ...
```

To run the typechecking, run `npm run ts`.

### Extensions Loader

The extension loader hot loads GDevelop extensions, as they are not included in every game (unused ones are filtered out when exporting), to be able to access GDevelops full functionality inside mods.
The list of includes is generated automatically using some modifications to GDCore (to be able to access includes from javascript) and a simple script. You can find it all here: https://github.com/arthuro555/GDevelop/tree/gdmod-generate-includes-list.
