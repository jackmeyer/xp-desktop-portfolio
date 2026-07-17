## Development

Start the dev server with:

```
npm run dev
```

It serves on http://localhost:4321. Dev and build both run with `--webpack`:
Turbopack's CSS parser rejects a selector in xp.css 0.2.6, webpack's
tolerates it.

Type-check with `npm run check`.

## Documentation

Full documentation: https://nextjs.org/docs

Consult these guides before working on related tasks:

- [Routing, pages, and layouts (App Router)](https://nextjs.org/docs/app/building-your-application/routing)
- [Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering)
- [Server Actions and form handling](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Route Handlers (API endpoints)](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Proxy (middleware)](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Styling](https://nextjs.org/docs/app/building-your-application/styling)
