import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, StatusBadge } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.admin.order.list({
        fields: "id,total,currency_code",
      }),
    queryKey: ["orders", "totals"],
  })

  // Calculate stats
  const totalOrders = data?.count ?? 0
  const revenue = data?.orders.reduce((sum, order) => sum + (order.total ?? 0), 0) ?? 0
  const avgOrderValue = totalOrders > 0 ? (revenue / totalOrders).toFixed(2) : 0
  const currencyCode = data?.orders[0]?.currency_code?.toUpperCase() || "USD"

//   // Helper to format currency
//   const formatAmount = (amount: number) => {
//     return new Intl.NumberFormat("en-US", {
//       style: "currency",
//       currency: currencyCode,
//     }).format(amount / 100) // Medusa stores amounts as integers (cents)
//   }

  return (
    <div className="flex flex-col gap-y-4 p-8">
      <Heading level="h1" className="mb-4">Business Overview</Heading>
      
      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        
        {/* Card: Total Revenue */}
        <Container className="flex flex-col gap-y-2 p-6">
          <div className="flex items-center justify-between">
            <Text size="small" className="text-ui-fg-subtle font-medium uppercase tracking-tight">
              Total Revenue
            </Text>
            <StatusBadge color="green">Live</StatusBadge>
          </div>
          <Heading level="h1" className="mt-2">
            {isLoading ? "..." : revenue}
          </Heading>
        </Container>

        {/* Card: Total Orders */}
        <Container className="flex flex-col gap-y-2 p-6">
          <Text size="small" className="text-ui-fg-subtle font-medium uppercase tracking-tight">
            Orders Count
          </Text>
          <Heading level="h1" className="mt-2">
            {isLoading ? "..." : totalOrders.toLocaleString()}
          </Heading>
        </Container>

        {/* Card: Average Order Value */}
        <Container className="flex flex-col gap-y-2 p-6">
          <Text size="small" className="text-ui-fg-subtle font-medium uppercase tracking-tight">
            Avg. Order Value
          </Text>
          <Heading level="h1" className="mt-2">
            {isLoading ? "..." : avgOrderValue}
          </Heading>
        </Container>

      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Porosite",
})

export default DashboardPage
