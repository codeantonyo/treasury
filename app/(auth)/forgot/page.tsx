import { ForgotForm } from "../forms";
import { Heading } from "../heading";

export default function Forgot() {
  return (
    <>
      <Heading title="Forgot password" sub="We'll email you a link to set a new one." />
      <ForgotForm />
    </>
  );
}
