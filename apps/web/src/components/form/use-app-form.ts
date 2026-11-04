import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "@/components/form/context";
import { DateField } from "@/components/form/date-field";
import { Form } from "@/components/form/form";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/text-area-field";
import { TextField } from "@/components/form/text-field";

export const { useAppForm } = createFormHook({
  fieldComponents: {
    DateField,
    TextAreaField,
    TextField,
  },
  fieldContext,
  formComponents: {
    Form,
    SubmitButton,
  },
  formContext,
});
