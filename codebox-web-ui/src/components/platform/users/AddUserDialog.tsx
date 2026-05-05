import { useState } from "react"
import { toast } from "sonner"
import { useCreateUser } from "@/net/query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [userType, setUserType] = useState<"user" | "admin">("user")
  const createMutation = useCreateUser()

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setUsername("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setUserType("user")
    }
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    createMutation.mutate(
      {
        username,
        password,
        userType,
        firstName: firstName || null,
        lastName: lastName || null,
      },
      {
        onSuccess: () => {
          toast.success(`User "${username}" created`)
          onOpenChange(false)
        },
        onError: () =>
          toast.error("Failed to create user. Username may already exist."),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Add a new user account with a username and password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-first-name">First name</Label>
              <Input
                id="new-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-last-name">Last name</Label>
              <Input
                id="new-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={userType === "user" ? "default" : "outline"}
                onClick={() => setUserType("user")}
              >
                User
              </Button>
              <Button
                type="button"
                size="sm"
                variant={userType === "admin" ? "default" : "outline"}
                onClick={() => setUserType("admin")}
              >
                Admin
              </Button>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={
                createMutation.isPending || !username || !password
              }
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}