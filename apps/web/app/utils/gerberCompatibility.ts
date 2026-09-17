/** JLCPCB recognizes color eligibility from these generator comments.
 * Compatibility format observed in TransJLC; original KiCad commands stay intact.
 */
export const withJlcColorHeader = (gerber: string, date = new Date()) => {
  const timestamp = date.toISOString().slice(0, 19).replace('T', ' ')
  return `G04 EasyEDA Pro v2.2.42.2, ${timestamp}*\nG04 Gerber Generator version 0.3*\nG04 Overprint compatibility export from KiCad*\n${gerber}`
}
