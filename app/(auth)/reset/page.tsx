import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "../forms";
import { Heading } from "../heading";

export default function Reset(props: PageProps<"/reset">) {
  return (
    <>
      <Heading title="Set a new password" sub="Choose a password you don't use anywhere else." />
      <Suspense>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/reset">["searchParams"] }) {
  const { u, t } = await searchParams;
  if (typeof u !== "string" || typeof t !== "string")
    return (
      <p className="text-center text-sm text-muted-2">
        This link is incomplete.{" "}
        <Link href="/forgot" className="font-bold text-lilac">
          Ask for a new one
        </Link>
        .
      </p>
    );
  return <ResetForm u={u} t={t} />;
}
