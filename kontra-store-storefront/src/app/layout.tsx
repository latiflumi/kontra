import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  title: {
    template: "%s | Kontra", // The %s is a placeholder for the child's title
    default: "Kontra",      // Used if a child page has NO title
  },
  description: "Best deals from premium brands",
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
