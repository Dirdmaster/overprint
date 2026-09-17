<template>
  <div class="flex min-h-svh flex-col">
    <div class="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <header class="flex items-center justify-between gap-4">
        <NuxtLink
          to="/"
          class="text-sm text-muted underline"
        >
          {{ $t('common.backToEditor') }}
        </NuxtLink>
        <div class="flex items-center gap-3">
          <AlphaBadge />
          <ThemeToggle />
        </div>
      </header>
      <main><slot /></main>
    </div>
    <CanvasFooter />
  </div>
</template>
