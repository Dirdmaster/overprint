// app/page.jsx (Server Component)
import NextEditor from './next-editor'
import board from './board.json' // Your host-supplied BoardPackage JSON

export default function Page() {
  return <NextEditor board={board} />
}
