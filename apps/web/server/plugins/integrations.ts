export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('request', event => {
    const url = getRequestURL(event)
    if (url.pathname === '/integrations') {
      return sendRedirect(event, `/integrations/${url.search}`, 302)
    }
  })
})
