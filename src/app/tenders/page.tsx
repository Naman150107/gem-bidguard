import Link from "next/link";
import { FileText, Users, ListChecks, Scale, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenders } from "@/lib/queries";
import { formatINR, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TendersPage() {
  const tenders = await getTenders();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenders"
        description="Active GeM tenders and their eligibility requirements, compliance rules, and participating bidders."
      />

      {tenders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No tenders seeded yet. Run{" "}
            <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tenders.map((t) => (
            <Link key={t.id} href={`/tenders/${t.id}`} className="group block">
              <Card className="transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        {t.referenceNo}
                        <Badge variant="secondary">{t.category}</Badge>
                      </div>
                      <CardTitle className="text-lg">{t.title}</CardTitle>
                      <CardDescription>{t.ministry}</CardDescription>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        Estimated value:{" "}
                      </span>
                      <span className="font-semibold">
                        {formatINR(t.estimatedValue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Bid deadline:{" "}
                      </span>
                      <span className="font-medium">
                        {formatDate(t.bidSubmissionDeadline)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {t._count.bidders} bidders
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="h-4 w-4" />
                        {t._count.requirements} requirements
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Scale className="h-4 w-4" />
                        {t._count.rules} rules
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
