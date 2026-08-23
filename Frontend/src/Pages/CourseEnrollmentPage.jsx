import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BookOpen, Users, RefreshCw } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import PageTransition from '../components/ui/PageTransition';
import api from '../Api/axiosClient';

const CourseEnrollmentPage = () => {
  usePageHeader({ title: 'Course Enrollment', subtitle: 'Manage student enrollments for courses' });

  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchEnrollments(selectedCourse);
    } else {
      setEnrolledStudents([]);
    }
  }, [selectedCourse]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [resCourses, resClasses] = await Promise.all([
        api.get('/courses'),
        api.get('/classes')
      ]);
      setCourses(resCourses.data.data || resCourses.data);
      setClasses(resClasses.data.data);
    } catch (err) {
      toast.error('Failed to load courses or classes.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrollments = async (courseId) => {
    setLoadingEnrollments(true);
    try {
      const res = await api.get(`/courses/${courseId}/enrollment`);
      setEnrolledStudents(res.data.data?.students || []);
    } catch (err) {
      toast.error('Failed to load enrolled students.');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const handleEnrollClass = async () => {
    if (!selectedCourse || !selectedClass) {
      toast.error('Please select both a Course and an Academic Class.');
      return;
    }
    setIsEnrolling(true);
    try {
      // 1. Get all students in the selected class
      const resClassStudents = await api.get(`/classes/${selectedClass}/students`);
      const classStudents = resClassStudents.data.data || [];
      
      if (classStudents.length === 0) {
        toast.error('The selected class has no mapped students.');
        setIsEnrolling(false);
        return;
      }

      // 2. Add them to the course
      const studentIds = classStudents.map(s => s.id);
      await api.post(`/courses/${selectedCourse}/enrollment`, { studentIds });
      
      toast.success(`Successfully enrolled ${studentIds.length} students to the course!`);
      fetchEnrollments(selectedCourse);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error enrolling students.');
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <PageTransition>
      <div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-8 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-xl">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Course Enrollment</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage which classes and students are enrolled in specific courses.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-bold mb-4">Select Course</h3>
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.course_code} - {c.subject_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-bold mb-4">Enroll Entire Class</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">Select Academic Class</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        Sem {c.semester} - Sec {c.section || 'N/A'} (Prog: {c.program_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                onClick={handleEnrollClass}
                disabled={isEnrolling || !selectedCourse || !selectedClass}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {isEnrolling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Enroll Entire Class
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Enrolled Students ({enrolledStudents.length})</h3>
            </div>
            
            {!selectedCourse ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Please select a course to view enrollments.</div>
            ) : loadingEnrollments ? (
              <div className="text-sm text-muted-foreground flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin" /></div>
            ) : enrolledStudents.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No students currently enrolled in this course.</div>
            ) : (
              <div className="overflow-x-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Registration No.</TableHead>
                      <TableHead>Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrolledStudents.map(student => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.registration_number}</TableCell>
                        <TableCell>{student.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default CourseEnrollmentPage;
