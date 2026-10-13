import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { RegisterForm } from "../forms";
import { Heading } from "../heading";

export default function Register(props: PageProps<"/register">) {
  return (
    <>
      <Heading title="Create your account" sub="Hold XLMTREASURY2, climb 12 tiers, earn for every friend." />
      <Suspense>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/register">["searchParams"] }) {
  if (await currentUser()) redirect("/");
  const { ref } = await searchParams;
  return <RegisterForm refCode={typeof ref === "string" ? ref.toUpperCase() : ""} />;
}
